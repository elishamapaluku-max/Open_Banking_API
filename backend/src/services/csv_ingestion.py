"""
KipaAPI — CSV Bank Statement Ingestion Module
===============================================
Parses CSV exports from Kenyan banks into the KipaAPI
normalized transaction schema.

Supported formats:
  - M-Pesa CSV (Safaricom statement export)
  - KCB Bank CSV
  - Equity Bank CSV
  - Co-operative Bank CSV
  - Generic fallback (attempts to map any CSV with recognizable columns)

Usage:
  from csv_ingestion import ingest_csv
  result = ingest_csv("statement.csv", source="AUTO", account_id="acc_xyz")

Output: List of normalized transaction dicts matching transaction.schema.js
"""

import csv
import re
import uuid
import io
from datetime import datetime, timezone
from typing import Optional

# ─────────────────────────────────────────────
# RE-USE HELPERS FROM PARSER SERVICE
# (copy these in if running standalone,
#  otherwise import from parser_service)
# ─────────────────────────────────────────────

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

DESCRIPTION_KEYWORDS = [
    (r"salary|payroll|pay slip",                   "employer",     "SALARY"),
    (r"kplc|kenya power|prepaid token",            "utility",      "UTILITIES"),
    (r"nairobi water|nwsc",                        "utility",      "UTILITIES"),
    (r"zuku|safaricom home|faiba",                 "utility",      "UTILITIES"),
    (r"naivas|carrefour|quickmart|cleanshelf",     "supermarket",  "FOOD_GROCERIES"),
    (r"uber|bolt|little cab|matatu|fuel|shell|total|kenol", "transport", "TRANSPORT"),
    (r"fuliza|m-shwari|kcb mpesa|tala|branch",     "lender",       "LOAN_REPAYMENT"),
    (r"school|university|college|tuition|fees",    "education",    "EDUCATION"),
    (r"pharmacy|hospital|clinic|medical",          "health",       "HEALTH"),
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


def generate_txn_id() -> str:
    return f"txn_{uuid.uuid4().hex[:12]}"


def clean_amount(raw: str) -> Optional[float]:
    if not raw or not str(raw).strip():
        return None
    cleaned = re.sub(r"[,\s]", "", str(raw).strip())
    try:
        val = float(cleaned)
        return val if val > 0 else None
    except ValueError:
        return None


def parse_date_flexible(raw: str) -> Optional[str]:
    if not raw:
        return None
    raw = str(raw).strip()
    formats = [
        "%d/%m/%Y", "%d-%m-%Y",
        "%d-%b-%Y", "%d/%b/%Y",
        "%d %b %Y", "%d %B %Y",
        "%Y-%m-%d", "%d-%b-%y",
        "%m/%d/%Y", "%Y/%m/%d",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def infer_category(description: str) -> tuple:
    text = description.lower()
    for pattern, merchant_type, category in DESCRIPTION_KEYWORDS:
        if re.search(pattern, text, re.IGNORECASE):
            return merchant_type, category
    return "unknown", "OTHER"


def resolve_paybill(description: str) -> tuple:
    match = re.search(r"\b(\d{5,7})\b", description)
    if match:
        paybill = match.group(1)
        if paybill in PAYBILL_MERCHANTS:
            merchant, category = PAYBILL_MERCHANTS[paybill]
            return paybill, merchant, category
    return None, None, None


def build_normalized(
    date, datetime_str, amount, txn_type, source,
    raw_description, reference=None, running_balance=None,
    source_metadata=None, account_id="acc_unknown"
) -> dict:
    """Assemble a normalized transaction dict."""
    _, pb_merchant, pb_category = resolve_paybill(raw_description)
    if pb_merchant:
        merchant = pb_merchant
        merchant_type, category = "merchant", pb_category
    else:
        merchant = None
        merchant_type, category = infer_category(raw_description)

    description = re.sub(r"\s{2,}", " ", raw_description).strip(" -")

    return {
        "id":               generate_txn_id(),
        "account_id":       account_id,
        "date":             date,
        "datetime":         datetime_str,
        "amount":           round(amount, 2),
        "currency":         "KES",
        "type":             txn_type,
        "source":           source,
        "ingestion_method": "CSV_IMPORT",
        "raw_description":  raw_description,
        "description":      description or raw_description,
        "category":         category,
        "merchant":         merchant,
        "merchant_type":    merchant_type,
        "reference":        reference,
        "running_balance":  running_balance,
        "is_recurring":     False,
        "is_income_signal": False,
        "is_anomaly":       False,
        "source_metadata":  source_metadata or {},
        "created_at":       datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


# ─────────────────────────────────────────────
# COLUMN DETECTION
# ─────────────────────────────────────────────

def normalize_header(h: str) -> str:
    """Lowercase, strip, collapse spaces for fuzzy header matching."""
    return re.sub(r"\s+", "_", h.strip().lower())


def detect_columns(headers: list[str]) -> dict:
    """
    Map normalized header names to column indices.
    Returns a dict like: { "date": 0, "description": 2, "credit": 4, ... }
    """
    mapping = {}
    normalized = [normalize_header(h) for h in headers]

    DATE_ALIASES        = {"date", "trans_date", "transaction_date", "posting_date",
                           "value_date", "completion_time", "transaction_time"}
    DESCRIPTION_ALIASES = {"description", "details", "narrative", "transaction_details",
                           "particulars", "remarks", "memo"}
    DEBIT_ALIASES       = {"debit", "dr", "debit_amount", "dr_amount", "withdrawn",
                           "amount_dr", "money_out"}
    CREDIT_ALIASES      = {"credit", "cr", "credit_amount", "cr_amount", "paid_in",
                           "amount_cr", "money_in"}
    BALANCE_ALIASES     = {"balance", "running_balance", "closing_balance",
                           "available_balance", "bal"}
    REFERENCE_ALIASES   = {"reference", "receipt_no", "transaction_id", "ref",
                           "trans_ref", "transaction_ref", "receipt_number"}
    AMOUNT_ALIASES      = {"amount", "transaction_amount"}  # single-column amount

    alias_groups = {
        "date":        DATE_ALIASES,
        "description": DESCRIPTION_ALIASES,
        "debit":       DEBIT_ALIASES,
        "credit":      CREDIT_ALIASES,
        "balance":     BALANCE_ALIASES,
        "reference":   REFERENCE_ALIASES,
        "amount":      AMOUNT_ALIASES,
    }

    for field, aliases in alias_groups.items():
        for i, col in enumerate(normalized):
            if col in aliases and field not in mapping:
                mapping[field] = i

    return mapping


# ─────────────────────────────────────────────
# SOURCE-SPECIFIC PARSERS
# ─────────────────────────────────────────────

def parse_mpesa_csv(rows: list[dict], account_id: str) -> list[dict]:
    """
    M-Pesa CSV export columns:
    Receipt No.,Completion Time,Details,Transaction Status,Paid In,Withdrawn,Balance
    """
    transactions = []

    for row in rows:
        receipt     = row.get("Receipt No.", "").strip()
        comp_time   = row.get("Completion Time", "").strip()
        details     = row.get("Details", "").strip()
        status      = row.get("Transaction Status", "").strip()
        paid_in     = row.get("Paid In", "").strip()
        withdrawn   = row.get("Withdrawn", "").strip()
        balance     = row.get("Balance", "").strip()

        if status.lower() not in ("completed", ""):
            continue

        paid_in_amt   = clean_amount(paid_in)
        withdrawn_amt = clean_amount(withdrawn)

        if paid_in_amt:
            amount, txn_type = paid_in_amt, "CREDIT"
        elif withdrawn_amt:
            amount, txn_type = withdrawn_amt, "DEBIT"
        else:
            continue

        # Parse datetime from "15/05/2026 14:32"
        date = None
        datetime_str = None
        if comp_time:
            parts = comp_time.split()
            date = parse_date_flexible(parts[0])
            if len(parts) > 1:
                try:
                    dt = datetime.strptime(comp_time, "%d/%m/%Y %H:%M")
                    datetime_str = dt.strftime("%Y-%m-%dT%H:%M:00+03:00")
                except ValueError:
                    pass

        if not date:
            continue

        transactions.append(build_normalized(
            date=date,
            datetime_str=datetime_str,
            amount=amount,
            txn_type=txn_type,
            source="MPESA",
            raw_description=details,
            reference=receipt or None,
            running_balance=clean_amount(balance),
            source_metadata={
                "receipt_no":      receipt,
                "completion_time": comp_time,
                "status":          status,
            },
            account_id=account_id,
        ))

    return transactions


def parse_kcb_csv(rows: list[dict], account_id: str) -> list[dict]:
    """
    KCB CSV export columns:
    Date, Value Date, Description, Debit, Credit, Balance
    """
    transactions = []

    for row in rows:
        raw_date    = row.get("Date", row.get("Trans Date", "")).strip()
        description = row.get("Description", "").strip()
        debit       = row.get("Debit", row.get("DR", "")).strip()
        credit      = row.get("Credit", row.get("CR", "")).strip()
        balance     = row.get("Balance", "").strip()

        if not raw_date or not description:
            continue

        date = parse_date_flexible(raw_date)
        if not date:
            continue

        debit_amt  = clean_amount(debit)
        credit_amt = clean_amount(credit)

        if credit_amt:
            amount, txn_type = credit_amt, "CREDIT"
        elif debit_amt:
            amount, txn_type = debit_amt, "DEBIT"
        else:
            continue

        ref_match = re.search(r'\b([A-Z0-9]{8,20})\b', description)
        reference = ref_match.group(1) if ref_match else None

        transactions.append(build_normalized(
            date=date,
            datetime_str=None,
            amount=amount,
            txn_type=txn_type,
            source="KCB",
            raw_description=description,
            reference=reference,
            running_balance=clean_amount(balance),
            source_metadata={
                "value_date": row.get("Value Date", "").strip(),
                "raw_debit":  debit,
                "raw_credit": credit,
            },
            account_id=account_id,
        ))

    return transactions


def parse_equity_csv(rows: list[dict], account_id: str) -> list[dict]:
    """
    Equity Bank CSV export columns:
    Posting Date, Value Date, Narrative, Debit Amount, Credit Amount, Running Balance
    """
    transactions = []

    for row in rows:
        raw_date    = row.get("Posting Date", row.get("Date", "")).strip()
        narrative   = row.get("Narrative", row.get("Description", "")).strip()
        debit       = row.get("Debit Amount", row.get("Debit", "")).strip()
        credit      = row.get("Credit Amount", row.get("Credit", "")).strip()
        balance     = row.get("Running Balance", row.get("Balance", "")).strip()

        if not raw_date or not narrative:
            continue

        date = parse_date_flexible(raw_date)
        if not date:
            continue

        debit_amt  = clean_amount(debit)
        credit_amt = clean_amount(credit)

        if credit_amt:
            amount, txn_type = credit_amt, "CREDIT"
        elif debit_amt:
            amount, txn_type = debit_amt, "DEBIT"
        else:
            continue

        ref_match = re.search(r'\b(EQ\w{8,16}|TXN\w{6,16})\b', narrative, re.IGNORECASE)
        reference = ref_match.group(1) if ref_match else None

        transactions.append(build_normalized(
            date=date,
            datetime_str=None,
            amount=amount,
            txn_type=txn_type,
            source="EQUITY",
            raw_description=narrative,
            reference=reference,
            running_balance=clean_amount(balance),
            source_metadata={
                "value_date": row.get("Value Date", "").strip(),
                "raw_debit":  debit,
                "raw_credit": credit,
            },
            account_id=account_id,
        ))

    return transactions


def parse_coop_csv(rows: list[dict], account_id: str) -> list[dict]:
    """
    Co-op Bank CSV export columns:
    Trans Date, Value Date, Transaction Ref, Description, DR Amount, CR Amount, Balance
    """
    transactions = []

    for row in rows:
        raw_date    = row.get("Trans Date", row.get("Date", "")).strip()
        ref         = row.get("Transaction Ref", row.get("Reference", "")).strip()
        description = row.get("Description", row.get("Narrative", "")).strip()
        dr_amount   = row.get("DR Amount", row.get("Debit", "")).strip()
        cr_amount   = row.get("CR Amount", row.get("Credit", "")).strip()
        balance     = row.get("Balance", "").strip()

        if not raw_date or not description:
            continue

        date = parse_date_flexible(raw_date)
        if not date:
            continue

        debit_amt  = clean_amount(dr_amount)
        credit_amt = clean_amount(cr_amount)

        if credit_amt:
            amount, txn_type = credit_amt, "CREDIT"
        elif debit_amt:
            amount, txn_type = debit_amt, "DEBIT"
        else:
            continue

        transactions.append(build_normalized(
            date=date,
            datetime_str=None,
            amount=amount,
            txn_type=txn_type,
            source="COOP",
            raw_description=description,
            reference=ref or None,
            running_balance=clean_amount(balance),
            source_metadata={
                "value_date": row.get("Value Date", "").strip(),
                "raw_dr":     dr_amount,
                "raw_cr":     cr_amount,
            },
            account_id=account_id,
        ))

    return transactions


# ─────────────────────────────────────────────
# GENERIC FALLBACK PARSER
# ─────────────────────────────────────────────

def parse_generic_csv(rows: list[dict], headers: list[str], account_id: str) -> list[dict]:
    """
    Fallback parser for unknown CSV formats.
    Uses fuzzy column detection to map headers to normalized fields.
    Handles both split (debit/credit columns) and single (amount + type) formats.
    """
    transactions = []
    cols = detect_columns(headers)

    if "date" not in cols or "description" not in cols:
        return []  # Can't parse without at minimum date + description

    for row in rows:
        raw_date    = str(row.get(headers[cols["date"]], "")).strip()
        description = str(row.get(headers[cols["description"]], "")).strip()

        if not raw_date or not description:
            continue

        date = parse_date_flexible(raw_date)
        if not date:
            continue

        # Try split debit/credit columns first
        debit_amt  = clean_amount(row.get(headers[cols["debit"]], "")) if "debit" in cols else None
        credit_amt = clean_amount(row.get(headers[cols["credit"]], "")) if "credit" in cols else None

        if credit_amt:
            amount, txn_type = credit_amt, "CREDIT"
        elif debit_amt:
            amount, txn_type = debit_amt, "DEBIT"

        # Fall back to single amount column
        elif "amount" in cols:
            raw_amount = str(row.get(headers[cols["amount"]], "")).strip()
            # Negative = debit in some exports
            clean = re.sub(r"[,\s]", "", raw_amount)
            try:
                val = float(clean)
                amount   = abs(val)
                txn_type = "DEBIT" if val < 0 else "CREDIT"
            except ValueError:
                continue
        else:
            continue

        reference = str(row.get(headers[cols["reference"]], "")).strip() if "reference" in cols else None
        balance   = clean_amount(row.get(headers[cols["balance"]], "")) if "balance" in cols else None

        transactions.append(build_normalized(
            date=date,
            datetime_str=None,
            amount=amount,
            txn_type=txn_type,
            source="UNKNOWN",
            raw_description=description,
            reference=reference or None,
            running_balance=balance,
            source_metadata={"raw_row": dict(row)},
            account_id=account_id,
        ))

    return transactions


# ─────────────────────────────────────────────
# AUTO-DETECT CSV SOURCE
# ─────────────────────────────────────────────

def detect_csv_source(headers: list[str], first_rows: list[dict]) -> str:
    """
    Detect bank source from CSV headers and first few rows.
    Returns: MPESA | KCB | EQUITY | COOP | UNKNOWN
    """
    header_str = " ".join(h.lower() for h in headers)

    if "receipt no" in header_str or "paid in" in header_str or "withdrawn" in header_str:
        return "MPESA"
    if "value date" in header_str and "debit" in header_str and "credit" in header_str:
        # Check first row content for bank clues
        if first_rows:
            first_desc = str(list(first_rows[0].values())).lower()
            if "equity" in first_desc:
                return "EQUITY"
            if "kcb" in first_desc or "kenya commercial" in first_desc:
                return "KCB"
        # Co-op uses "DR Amount" / "CR Amount"
        if "dr amount" in header_str or "cr amount" in header_str:
            return "COOP"
        if "narrative" in header_str or "posting date" in header_str:
            return "EQUITY"
        return "KCB"  # default bank fallback
    if "transaction ref" in header_str or "dr amount" in header_str:
        return "COOP"
    if "narrative" in header_str:
        return "EQUITY"

    return "UNKNOWN"


# ─────────────────────────────────────────────
# MAIN ENTRY POINT
# ─────────────────────────────────────────────

def ingest_csv(
    csv_input,
    source: str = "AUTO",
    account_id: str = "acc_unknown",
) -> dict:
    """
    Ingest a CSV bank statement into normalized KipaAPI transactions.

    Args:
        csv_input:  File path (str) OR raw CSV string OR file-like object
        source:     "AUTO" | "MPESA" | "KCB" | "EQUITY" | "COOP"
        account_id: KipaAPI account ID

    Returns:
        {
          "source":       "MPESA",
          "account_id":   "acc_xyz789",
          "total":        87,
          "transactions": [ ... ],
          "errors":       [],
          "skipped":      3
        }
    """
    errors = []
    transactions = []

    # ── Load CSV ──
    try:
        if isinstance(csv_input, str) and "\n" not in csv_input:
            # It's a file path
            with open(csv_input, newline="", encoding="utf-8-sig") as f:
                content = f.read()
        elif isinstance(csv_input, str):
            content = csv_input
        else:
            # File-like object (e.g. from Express multer upload)
            content = csv_input.read().decode("utf-8-sig")

        reader = csv.DictReader(io.StringIO(content))
        headers = reader.fieldnames or []
        rows = list(reader)

    except Exception as e:
        return {
            "source":       source,
            "account_id":   account_id,
            "total":        0,
            "transactions": [],
            "errors":       [f"Failed to read CSV: {str(e)}"],
            "skipped":      0,
        }

    if not rows:
        return {
            "source":       source,
            "account_id":   account_id,
            "total":        0,
            "transactions": [],
            "errors":       ["CSV file is empty or has no data rows"],
            "skipped":      0,
        }

    # ── Auto-detect source ──
    if source == "AUTO":
        source = detect_csv_source(headers, rows[:3])

    # ── Dispatch to parser ──
    try:
        if source == "MPESA":
            transactions = parse_mpesa_csv(rows, account_id)
        elif source == "KCB":
            transactions = parse_kcb_csv(rows, account_id)
        elif source == "EQUITY":
            transactions = parse_equity_csv(rows, account_id)
        elif source == "COOP":
            transactions = parse_coop_csv(rows, account_id)
        else:
            # Generic fallback
            transactions = parse_generic_csv(rows, list(headers), account_id)
            if not transactions:
                errors.append(
                    f"Could not detect bank format. Headers found: {headers}. "
                    "Please specify source manually."
                )
            source = "UNKNOWN"

    except Exception as e:
        errors.append(f"Parse error: {str(e)}")

    skipped = len(rows) - len(transactions)

    return {
        "source":       source,
        "account_id":   account_id,
        "total":        len(transactions),
        "transactions": transactions,
        "errors":       errors,
        "skipped":      skipped,
    }


# ─────────────────────────────────────────────
# CLI + SELF-TESTS
# ─────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    import json

    if len(sys.argv) < 2:
        print("Usage: python csv_ingestion.py <path.csv> [MPESA|KCB|EQUITY|COOP]")
        print("\nRunning self-tests...")

        # ── Test 1: M-Pesa CSV ──
        mpesa_csv = """Receipt No.,Completion Time,Details,Transaction Status,Paid In,Withdrawn,Balance
QK12ABC456,15/05/2026 14:32,Pay Bill Online 000300 - KPLC PREPAID,Completed,,4500.00,12450.00
QK99XYZ789,16/05/2026 09:10,Received from 0712345678 JOHN DOE,Completed,5000.00,,17450.00
QK55MNO321,17/05/2026 18:45,Withdraw Cash Agent 12345,Completed,,2000.00,15450.00"""

        result = ingest_csv(mpesa_csv, source="AUTO")
        assert result["source"] == "MPESA", f"Expected MPESA, got {result['source']}"
        assert result["total"] == 3, f"Expected 3 transactions, got {result['total']}"
        assert result["transactions"][0]["type"] == "DEBIT"
        assert result["transactions"][0]["amount"] == 4500.0
        assert result["transactions"][0]["category"] == "UTILITIES"
        assert result["transactions"][1]["type"] == "CREDIT"
        assert result["transactions"][1]["amount"] == 5000.0
        assert result["transactions"][2]["category"] == "WITHDRAWAL"
        print("  ✓ M-Pesa CSV — 3 transactions parsed correctly")

        # ── Test 2: KCB CSV ──
        kcb_csv = """Date,Value Date,Description,Debit,Credit,Balance
15-May-2026,15-May-2026,MPESA PAYMENT FROM 254712XXXXXX JOHN DOE,,5000.00,67320.50
16-May-2026,16-May-2026,ATM WITHDRAWAL NBI BRANCH,3000.00,,64320.50
17-May-2026,17-May-2026,EFT CREDIT EMPLOYER PAYROLL SAFARICOM LTD,,85000.00,149320.50"""

        result = ingest_csv(kcb_csv, source="KCB")
        assert result["total"] == 3
        assert result["transactions"][0]["type"] == "CREDIT"
        assert result["transactions"][1]["type"] == "DEBIT"
        assert result["transactions"][2]["category"] == "SALARY"
        print("  ✓ KCB CSV — 3 transactions parsed correctly")

        # ── Test 3: Equity CSV ──
        equity_csv = """Posting Date,Value Date,Narrative,Debit Amount,Credit Amount,Running Balance
15/05/2026,15/05/2026,EFT CREDIT EMPLOYER PAYROLL SAFARICOM LTD,,85000.00,102450.75
16/05/2026,16/05/2026,KPLC PREPAID PAYMENT 000300,4500.00,,97950.75
17/05/2026,17/05/2026,NAIVAS SUPERMARKET WESTLANDS,2300.00,,95650.75"""

        result = ingest_csv(equity_csv, source="EQUITY")
        assert result["total"] == 3
        assert result["transactions"][0]["category"] == "SALARY"
        assert result["transactions"][1]["category"] == "UTILITIES"
        assert result["transactions"][2]["category"] == "FOOD_GROCERIES"
        print("  ✓ Equity CSV — 3 transactions parsed correctly")

        # ── Test 4: Co-op CSV ──
        coop_csv = """Trans Date,Value Date,Transaction Ref,Description,DR Amount,CR Amount,Balance
15/05/2026,15/05/2026,RTGS/001/150526,SALARY CREDIT MINISTRY OF EDUCATION,,45000.00,48200.00
16/05/2026,16/05/2026,MOB/002/160526,AIRTIME PURCHASE SAFARICOM,500.00,,47700.00"""

        result = ingest_csv(coop_csv, source="COOP")
        assert result["total"] == 2
        assert result["transactions"][0]["category"] == "SALARY"
        assert result["transactions"][1]["category"] == "AIRTIME_BUNDLES"
        print("  ✓ Co-op CSV — 2 transactions parsed correctly")

        # ── Test 5: Generic fallback ──
        generic_csv = """date,description,amount,balance
2026-05-15,Rent Payment to Landlord Kimani,-25000.00,75000.00
2026-05-16,Salary from Andela Kenya,120000.00,195000.00"""

        result = ingest_csv(generic_csv, source="AUTO")
        assert result["total"] == 2
        assert result["transactions"][0]["type"] == "DEBIT"
        assert result["transactions"][0]["category"] == "RENT"
        assert result["transactions"][1]["type"] == "CREDIT"
        assert result["transactions"][1]["category"] == "SALARY"
        print("  ✓ Generic fallback — 2 transactions parsed correctly")

        # ── Test 6: Empty CSV ──
        result = ingest_csv("date,description\n", source="AUTO")
        assert result["total"] == 0
        assert len(result["errors"]) > 0
        print("  ✓ Empty CSV — handled gracefully")

        print("\nAll self-tests passed.")
        sys.exit(0)

    # Parse a real file
    csv_path = sys.argv[1]
    source   = sys.argv[2] if len(sys.argv) > 2 else "AUTO"
    result   = ingest_csv(csv_path, source=source)

    print(json.dumps(result, indent=2))