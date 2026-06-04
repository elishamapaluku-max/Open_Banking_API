"""
KipaAPI — PDF Bank Statement Parser
=====================================
Parses bank statement PDFs from Kenyan banks and M-Pesa into
the KipaAPI normalized transaction schema.

Supported formats:
  - M-Pesa (Safaricom PDF statement)
  - KCB Bank
  - Equity Bank
  - Co-operative Bank (Co-op)

Usage:
  from parser_service import parse_statement
  result = parse_statement("statement.pdf", source="AUTO")

Output: List of normalized transaction dicts matching transaction.schema.js
"""

import pdfplumber
import re
import uuid
from datetime import datetime
from typing import Optional


# ─────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────

SUPPORTED_SOURCES = ["MPESA", "KCB", "EQUITY", "COOP", "AUTO"]

# Paybill → Merchant mapping (common Kenyan paybills)
PAYBILL_MERCHANTS = {
    "000300": ("Kenya Power",         "UTILITIES"),
    "888880": ("Nairobi Water",        "UTILITIES"),
    "400200": ("DSTV",                 "ENTERTAINMENT"),
    "200999": ("Zuku",                 "UTILITIES"),
    "247247": ("Equity Bank",          "LOAN_REPAYMENT"),
    "522533": ("Safaricom Postpaid",   "AIRTIME_BUNDLES"),
    "777777": ("M-Shwari",             "SAVINGS"),
    "333333": ("KCB M-Pesa",           "LOAN_REPAYMENT"),
    "603045": ("NHIF",                 "INSURANCE"),
    "195195": ("NSSF",                 "INSURANCE"),
}

# Keyword → (merchant_type, category) for description matching
DESCRIPTION_KEYWORDS = [
    (r"salary|payroll|pay slip",                   "employer",     "SALARY"),
    (r"kplc|kenya power|prepaid token",            "utility",      "UTILITIES"),
    (r"nairobi water|nwsc",                        "utility",      "UTILITIES"),
    (r"zuku|safaricom home|faiba",                 "utility",      "UTILITIES"),
    (r"naivas|carrefour|quickmart|cleanshelf",     "supermarket",  "FOOD_GROCERIES"),
    (r"uber|bolt|little cab|matatu|fuel|shell|total|kenol", "transport", "TRANSPORT"),
    (r"fuliza|m-shwari|kcb mpesa|tala|branch",     "lender",       "LOAN_REPAYMENT"),
    (r"school|university|college|tuition|fees",    "education",    "EDUCATION"),
    (r"pharmacy|hospital|clinic|nhif|medical",     "health",       "HEALTH"),
    (r"nhif",                                      "insurance",    "INSURANCE"),
    (r"nssf",                                      "insurance",    "INSURANCE"),
    (r"dstv|netflix|showmax|youtube",              "entertainment","ENTERTAINMENT"),
    (r"airtime|safaricom|airtel|telkom",           "telco",        "AIRTIME_BUNDLES"),
    (r"rent|landlord|caretaker|bedsitter",         "landlord",     "RENT"),
    (r"withdraw|cash out|agent",                   "agent",        "WITHDRAWAL"),
    (r"loan disbursement|loan credit",             "lender",       "LOAN_DISBURSEMENT"),
    (r"interest earned|interest credit",           "bank",         "INTEREST_EARNED"),
    (r"business|invoice|payment received",         "business",     "BUSINESS_INCOME"),
    (r"sent to|transfer to|paid to",               "peer",         "TRANSFER_OUT"),
    (r"received from|transfer from",               "peer",         "MOBILE_TRANSFER"),
    (r"savings|lock savings|fixed deposit",        "bank",         "SAVINGS"),
    (r"till|buy goods",                            "merchant",     "TILL"),
    (r"pay bill|paybill",                          "merchant",     "PAYBILL"),
]


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def generate_txn_id() -> str:
    return f"txn_{uuid.uuid4().hex[:12]}"


def clean_amount(raw: str) -> Optional[float]:
    """Convert '4,500.00' or '4500' or '' to float or None."""
    if not raw or not raw.strip():
        return None
    cleaned = re.sub(r"[,\s]", "", raw.strip())
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_date_flexible(raw: str) -> Optional[str]:
    """
    Parse various date formats into ISO 8601 YYYY-MM-DD.
    Handles: DD/MM/YYYY, DD-MM-YYYY, DD-Mon-YYYY, DD/Mon/YYYY, YYYY-MM-DD
    """
    if not raw:
        return None
    raw = raw.strip()
    formats = [
        "%d/%m/%Y", "%d-%m-%Y",
        "%d-%b-%Y", "%d/%b/%Y",
        "%d %b %Y", "%d %B %Y",
        "%Y-%m-%d", "%d-%b-%y",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def parse_datetime_mpesa(raw: str) -> Optional[str]:
    """Parse M-Pesa datetime: '15/05/2026 14:32' → ISO 8601 with Nairobi offset."""
    if not raw:
        return None
    try:
        dt = datetime.strptime(raw.strip(), "%d/%m/%Y %H:%M")
        return dt.strftime("%Y-%m-%dT%H:%M:00+03:00")
    except ValueError:
        return None


def infer_category(description: str, merchant: str = "") -> tuple[str, str]:
    """
    Infer (merchant_type, category) from description text using keyword matching.
    Returns ('OTHER', 'OTHER') if no match found.
    Claude will override this with higher accuracy — this is a pre-fill.
    """
    text = (description + " " + merchant).lower()
    for pattern, merchant_type, category in DESCRIPTION_KEYWORDS:
        if re.search(pattern, text, re.IGNORECASE):
            return merchant_type, category
    return "unknown", "OTHER"


def resolve_paybill_merchant(description: str) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Extract paybill number from description and resolve to merchant + category.
    Returns (paybill_number, merchant_name, category) or (None, None, None).
    """
    match = re.search(r"\b(\d{5,7})\b", description)
    if match:
        paybill = match.group(1)
        if paybill in PAYBILL_MERCHANTS:
            merchant, category = PAYBILL_MERCHANTS[paybill]
            return paybill, merchant, category
    return None, None, None


def normalize_transaction(
    date: str,
    datetime_str: Optional[str],
    amount: float,
    txn_type: str,
    source: str,
    ingestion_method: str,
    raw_description: str,
    reference: Optional[str] = None,
    running_balance: Optional[float] = None,
    source_metadata: Optional[dict] = None,
    account_id: str = "acc_unknown",
) -> dict:
    """
    Build a normalized transaction dict from parsed fields.
    Applies keyword-based category inference (Claude will refine later).
    """
    # Try paybill resolution first, then keyword matching
    paybill, pb_merchant, pb_category = resolve_paybill_merchant(raw_description)
    if pb_merchant:
        merchant = pb_merchant
        merchant_type, category = "merchant", pb_category
    else:
        merchant = None
        merchant_type, category = infer_category(raw_description)

    # Clean description
    description = raw_description.strip()
    for noise in ["Pay Bill Online", "OBI", "Mpesa", "MPESA"]:
        description = re.sub(rf"\b{re.escape(noise)}\b", "", description, flags=re.IGNORECASE).strip()
    description = re.sub(r"\s{2,}", " ", description).strip(" -")

    return {
        "id":               generate_txn_id(),
        "account_id":       account_id,
        "date":             date,
        "datetime":         datetime_str,
        "amount":           round(amount, 2),
        "currency":         "KES",
        "type":             txn_type,
        "source":           source,
        "ingestion_method": ingestion_method,
        "raw_description":  raw_description,
        "description":      description or raw_description,
        "category":         category,      # pre-fill; Claude overrides
        "merchant":         merchant,
        "merchant_type":    merchant_type,
        "reference":        reference,
        "running_balance":  running_balance,
        "is_recurring":     False,         # Claude sets these
        "is_income_signal": False,
        "is_anomaly":       False,
        "source_metadata":  source_metadata or {},
        "created_at":       datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


# ─────────────────────────────────────────────
# M-PESA PARSER
# ─────────────────────────────────────────────

def parse_mpesa(pdf_path: str, account_id: str = "acc_unknown") -> list[dict]:
    """
    Parse a Safaricom M-Pesa PDF statement.

    M-Pesa statement table columns (7 columns):
    Receipt No. | Completion Time | Details | Transaction Status |
    Paid In | Withdrawn | Balance
    """
    transactions = []

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            table = page.extract_table()
            if not table:
                continue

            for row in table:
                # Skip header rows and empty rows
                if not row or len(row) < 7:
                    continue
                if not row[0] or row[0].strip().lower() in ("receipt no.", "receipt no", ""):
                    continue

                receipt_no, completion_time, details, status, paid_in, withdrawn, balance = (
                    (row[i] or "").strip() for i in range(7)
                )

                # Only process completed transactions
                if status.lower() not in ("completed", ""):
                    continue

                paid_in_amt   = clean_amount(paid_in)
                withdrawn_amt = clean_amount(withdrawn)

                # Determine direction
                if paid_in_amt and paid_in_amt > 0:
                    amount   = paid_in_amt
                    txn_type = "CREDIT"
                elif withdrawn_amt and withdrawn_amt > 0:
                    amount   = withdrawn_amt
                    txn_type = "DEBIT"
                else:
                    continue  # zero or unparseable row

                date     = parse_date_flexible(completion_time.split()[0] if completion_time else "")
                dt_str   = parse_datetime_mpesa(completion_time)
                balance  = clean_amount(balance)

                if not date:
                    continue

                txn = normalize_transaction(
                    date=date,
                    datetime_str=dt_str,
                    amount=amount,
                    txn_type=txn_type,
                    source="MPESA",
                    ingestion_method="PDF_PARSE",
                    raw_description=details,
                    reference=receipt_no or None,
                    running_balance=balance,
                    source_metadata={
                        "receipt_no":       receipt_no,
                        "completion_time":  completion_time,
                        "status":           status,
                        "paid_in":          paid_in,
                        "withdrawn":        withdrawn,
                    },
                    account_id=account_id,
                )
                transactions.append(txn)

    return transactions


# ─────────────────────────────────────────────
# KCB PARSER
# ─────────────────────────────────────────────

def parse_kcb(pdf_path: str, account_id: str = "acc_unknown") -> list[dict]:
    """
    Parse a KCB Bank PDF statement.

    KCB table columns (6 columns):
    Date | Value Date | Description | Debit | Credit | Balance
    """
    transactions = []

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            table = page.extract_table()
            if not table:
                continue

            for row in table:
                if not row or len(row) < 6:
                    continue

                raw_date = (row[0] or "").strip()
                description = (row[2] or "").strip()
                debit  = (row[3] or "").strip()
                credit = (row[4] or "").strip()
                balance = (row[5] or "").strip()

                # Skip headers and empty rows
                if not raw_date or raw_date.lower() in ("date", "trans date", ""):
                    continue
                if not description:
                    continue

                date = parse_date_flexible(raw_date)
                if not date:
                    continue

                debit_amt  = clean_amount(debit)
                credit_amt = clean_amount(credit)

                if credit_amt and credit_amt > 0:
                    amount   = credit_amt
                    txn_type = "CREDIT"
                elif debit_amt and debit_amt > 0:
                    amount   = debit_amt
                    txn_type = "DEBIT"
                else:
                    continue

                # Extract reference from description if present (last word often is ref)
                ref_match = re.search(r'\b([A-Z0-9]{8,20})\b', description)
                reference = ref_match.group(1) if ref_match else None

                txn = normalize_transaction(
                    date=date,
                    datetime_str=None,
                    amount=amount,
                    txn_type=txn_type,
                    source="KCB",
                    ingestion_method="PDF_PARSE",
                    raw_description=description,
                    reference=reference,
                    running_balance=clean_amount(balance),
                    source_metadata={
                        "value_date": (row[1] or "").strip(),
                        "raw_debit":  debit,
                        "raw_credit": credit,
                    },
                    account_id=account_id,
                )
                transactions.append(txn)

    return transactions


# ─────────────────────────────────────────────
# EQUITY PARSER
# ─────────────────────────────────────────────

def parse_equity(pdf_path: str, account_id: str = "acc_unknown") -> list[dict]:
    """
    Parse an Equity Bank PDF statement.

    Equity table columns (5-6 columns):
    Posting Date | Value Date | Narrative | Debit Amount | Credit Amount | Running Balance
    """
    transactions = []

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            table = page.extract_table()
            if not table:
                continue

            for row in table:
                if not row or len(row) < 5:
                    continue

                raw_date    = (row[0] or "").strip()
                narrative   = (row[2] or "").strip()
                debit_amt   = (row[3] or "").strip()
                credit_amt  = (row[4] or "").strip()
                balance     = (row[5] or "").strip() if len(row) > 5 else ""

                if not raw_date or raw_date.lower() in ("posting date", "date", ""):
                    continue
                if not narrative:
                    continue

                date = parse_date_flexible(raw_date)
                if not date:
                    continue

                debit  = clean_amount(debit_amt)
                credit = clean_amount(credit_amt)

                if credit and credit > 0:
                    amount   = credit
                    txn_type = "CREDIT"
                elif debit and debit > 0:
                    amount   = debit
                    txn_type = "DEBIT"
                else:
                    continue

                # Equity often embeds transaction ID at end of narrative
                ref_match = re.search(r'\b(EQ\w{8,16}|TXN\w{6,16})\b', narrative, re.IGNORECASE)
                reference = ref_match.group(1) if ref_match else None

                txn = normalize_transaction(
                    date=date,
                    datetime_str=None,
                    amount=amount,
                    txn_type=txn_type,
                    source="EQUITY",
                    ingestion_method="PDF_PARSE",
                    raw_description=narrative,
                    reference=reference,
                    running_balance=clean_amount(balance),
                    source_metadata={
                        "value_date":   (row[1] or "").strip(),
                        "raw_debit":    debit_amt,
                        "raw_credit":   credit_amt,
                    },
                    account_id=account_id,
                )
                transactions.append(txn)

    return transactions


# ─────────────────────────────────────────────
# CO-OP PARSER
# ─────────────────────────────────────────────

def parse_coop(pdf_path: str, account_id: str = "acc_unknown") -> list[dict]:
    """
    Parse a Co-operative Bank PDF statement.

    Co-op table columns (6 columns):
    Trans Date | Value Date | Transaction Ref | Description | DR Amount | CR Amount | Balance
    """
    transactions = []

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            table = page.extract_table()
            if not table:
                continue

            for row in table:
                if not row or len(row) < 6:
                    continue

                raw_date    = (row[0] or "").strip()
                ref         = (row[2] or "").strip()
                description = (row[3] or "").strip()
                dr_amount   = (row[4] or "").strip()
                cr_amount   = (row[5] or "").strip()
                balance     = (row[6] or "").strip() if len(row) > 6 else ""

                if not raw_date or raw_date.lower() in ("trans date", "date", ""):
                    continue
                if not description:
                    continue

                date = parse_date_flexible(raw_date)
                if not date:
                    continue

                debit  = clean_amount(dr_amount)
                credit = clean_amount(cr_amount)

                if credit and credit > 0:
                    amount   = credit
                    txn_type = "CREDIT"
                elif debit and debit > 0:
                    amount   = debit
                    txn_type = "DEBIT"
                else:
                    continue

                txn = normalize_transaction(
                    date=date,
                    datetime_str=None,
                    amount=amount,
                    txn_type=txn_type,
                    source="COOP",
                    ingestion_method="PDF_PARSE",
                    raw_description=description,
                    reference=ref or None,
                    running_balance=clean_amount(balance),
                    source_metadata={
                        "value_date": (row[1] or "").strip(),
                        "raw_dr":     dr_amount,
                        "raw_cr":     cr_amount,
                    },
                    account_id=account_id,
                )
                transactions.append(txn)

    return transactions


# ─────────────────────────────────────────────
# AUTO-DETECT SOURCE
# ─────────────────────────────────────────────

def detect_source(pdf_path: str) -> str:
    """
    Read the first page text and detect which bank issued the statement.
    Returns one of: MPESA | KCB | EQUITY | COOP | UNKNOWN
    """
    with pdfplumber.open(pdf_path) as pdf:
        if not pdf.pages:
            return "UNKNOWN"
        text = (pdf.pages[0].extract_text() or "").upper()

    if "SAFARICOM" in text or "M-PESA" in text or "MPESA" in text:
        return "MPESA"
    if "KENYA COMMERCIAL BANK" in text or "KCB" in text:
        return "KCB"
    if "EQUITY BANK" in text or "EQUITY BANK KENYA" in text:
        return "EQUITY"
    if "CO-OPERATIVE BANK" in text or "CO-OP BANK" in text or "COOP BANK" in text:
        return "COOP"
    return "UNKNOWN"


# ─────────────────────────────────────────────
# MAIN ENTRY POINT
# ─────────────────────────────────────────────

def parse_statement(
    pdf_path: str,
    source: str = "AUTO",
    account_id: str = "acc_unknown",
) -> dict:
    """
    Parse a bank statement PDF into normalized KipaAPI transactions.

    Args:
        pdf_path:   Path to the PDF file
        source:     "AUTO" | "MPESA" | "KCB" | "EQUITY" | "COOP"
        account_id: KipaAPI account ID to attach transactions to

    Returns:
        {
          "source":       "MPESA",
          "account_id":   "acc_xyz789",
          "total":        87,
          "transactions": [ ... ],
          "errors":       []
        }
    """
    errors = []

    # Auto-detect source if not specified
    if source == "AUTO":
        source = detect_source(pdf_path)
        if source == "UNKNOWN":
            return {
                "source":       "UNKNOWN",
                "account_id":   account_id,
                "total":        0,
                "transactions": [],
                "errors":       ["Could not detect bank from PDF. Please specify source manually."],
            }

    # Dispatch to correct parser
    try:
        parsers = {
            "MPESA":  parse_mpesa,
            "KCB":    parse_kcb,
            "EQUITY": parse_equity,
            "COOP":   parse_coop,
        }
        if source not in parsers:
            raise ValueError(f"Unsupported source: {source}")

        transactions = parsers[source](pdf_path, account_id)

    except Exception as e:
        errors.append(str(e))
        transactions = []

    return {
        "source":       source,
        "account_id":   account_id,
        "total":        len(transactions),
        "transactions": transactions,
        "errors":       errors,
    }


# ─────────────────────────────────────────────
# CLI — quick test without a real PDF
# ─────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    import json

    if len(sys.argv) < 2:
        print("Usage: python parser_service.py <path_to_statement.pdf> [MPESA|KCB|EQUITY|COOP]")
        print("\nRunning self-test with helper functions...")

        # Test helpers
        assert clean_amount("4,500.00") == 4500.0
        assert clean_amount("") is None
        assert parse_date_flexible("15/05/2026") == "2026-05-15"
        assert parse_date_flexible("15-May-2026") == "2026-05-15"
        assert parse_date_flexible("15-05-2026") == "2026-05-15"
        assert parse_datetime_mpesa("15/05/2026 14:32") == "2026-05-15T14:32:00+03:00"

        mtype, cat = infer_category("EFT CREDIT - EMPLOYER PAYROLL - SAFARICOM LTD")
        assert cat == "SALARY", f"Expected SALARY, got {cat}"

        mtype, cat = infer_category("Pay Bill Online 000300 - KPLC PREPAID")
        assert cat == "UTILITIES", f"Expected UTILITIES, got {cat}"

        _, merchant, cat = resolve_paybill_merchant("Pay Bill 000300 Ref 12345")
        assert merchant == "Kenya Power"

        print("All self-tests passed.")
        sys.exit(0)

    pdf_path = sys.argv[1]
    source   = sys.argv[2] if len(sys.argv) > 2 else "AUTO"

    result = parse_statement(pdf_path, source=source)
    print(json.dumps(result, indent=2))