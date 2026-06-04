"""
KipaAPI — Synthetic Transaction Dataset Generator
===================================================
Generates realistic Kenyan financial transaction data for testing,
demo seeding, and Claude prompt validation.

Produces 100+ transactions across M-Pesa, KCB, and Equity Bank
reflecting real Kenyan spending patterns.

Usage:
  python3 generate_test_data.py
  python3 generate_test_data.py --count 200 --output transactions.json
  python3 generate_test_data.py --format csv --output transactions.csv

Output: Normalized transaction objects matching transaction.schema.js
"""

import json
import csv
import uuid
import random
import argparse
from datetime import datetime, timedelta, timezone
from copy import deepcopy


# ─────────────────────────────────────────────
# BORROWER PROFILES
# Realistic Kenyan borrower archetypes
# ─────────────────────────────────────────────

BORROWER_PROFILES = [
    {
        "name":             "James Mwangi",
        "account_id":       "acc_jmwangi001",
        "monthly_salary":   85000,
        "employer":         "Safaricom PLC",
        "salary_day":       25,
        "salary_source":    "EQUITY",
        "description":      "Mid-level telco employee, stable income, moderate expenses",
    },
    {
        "name":             "Grace Achieng",
        "account_id":       "acc_gachieng002",
        "monthly_salary":   45000,
        "employer":         "Ministry of Education",
        "salary_day":       28,
        "salary_source":    "COOP",
        "description":      "Civil servant, consistent salary, Fuliza user at month end",
    },
    {
        "name":             "Brian Kamau",
        "account_id":       "acc_bkamau003",
        "monthly_salary":   120000,
        "employer":         "Andela Kenya",
        "salary_day":       1,
        "salary_source":    "KCB",
        "description":      "Software engineer, high income, multiple savings products",
    },
]

# Default borrower for single-account dataset
DEFAULT_BORROWER = BORROWER_PROFILES[0]


# ─────────────────────────────────────────────
# TRANSACTION TEMPLATES
# Each template defines a recurring or one-off transaction pattern
# ─────────────────────────────────────────────

def make_templates(borrower):
    salary     = borrower["monthly_salary"]
    account_id = borrower["account_id"]
    employer   = borrower["employer"]
    sal_src    = borrower["salary_source"]
    sal_day    = borrower["salary_day"]

    return [
        # ── INCOME ──
        {
            "type":        "CREDIT",
            "source":      sal_src,
            "category":    "SALARY",
            "description": f"EFT CREDIT EMPLOYER PAYROLL {employer.upper()}",
            "amount_fn":   lambda: round(salary * random.uniform(0.97, 1.0)),  # slight variation
            "day_of_month": sal_day,
            "frequency":   "MONTHLY",
            "merchant":    employer,
            "weight":      1,
        },
        {
            "type":        "CREDIT",
            "source":      "MPESA",
            "category":    "BUSINESS_INCOME",
            "description": f"Received from 0712{random.randint(100000,999999)} CLIENT PAYMENT",
            "amount_fn":   lambda: random.choice([5000, 8000, 12000, 15000, 20000]),
            "frequency":   "RANDOM",
            "monthly_prob": 0.4,  # 40% chance each month
            "merchant":    None,
            "weight":      2,
        },

        # ── RENT ──
        {
            "type":        "DEBIT",
            "source":      "MPESA",
            "category":    "RENT",
            "description": "Pay Bill Online 123456 - LANDLORD RENT",
            "amount_fn":   lambda: round(salary * 0.28 / 1000) * 1000,  # ~28% of salary
            "day_of_month": 2,
            "frequency":   "MONTHLY",
            "merchant":    "Landlord",
            "weight":      1,
        },

        # ── UTILITIES ──
        {
            "type":        "DEBIT",
            "source":      "MPESA",
            "category":    "UTILITIES",
            "description": "Pay Bill Online 000300 - KPLC PREPAID",
            "amount_fn":   lambda: random.choice([1000, 1500, 2000, 2500]),
            "frequency":   "MONTHLY",
            "day_of_month": random.randint(5, 15),
            "merchant":    "Kenya Power",
            "weight":      1,
        },
        {
            "type":        "DEBIT",
            "source":      "MPESA",
            "category":    "UTILITIES",
            "description": "Pay Bill Online 200999 - ZUKU INTERNET",
            "amount_fn":   lambda: random.choice([2499, 3499, 4999]),
            "day_of_month": 10,
            "frequency":   "MONTHLY",
            "merchant":    "Zuku",
            "weight":      1,
        },

        # ── FOOD & GROCERIES ──
        {
            "type":        "DEBIT",
            "source":      "MPESA",
            "category":    "FOOD_GROCERIES",
            "description": "Buy Goods Till 174379 NAIVAS SUPERMARKET",
            "amount_fn":   lambda: random.randint(1500, 6000),
            "frequency":   "WEEKLY",
            "merchant":    "Naivas Supermarket",
            "weight":      4,
        },
        {
            "type":        "DEBIT",
            "source":      "MPESA",
            "category":    "FOOD_GROCERIES",
            "description": "Buy Goods Till 891234 CARREFOUR SUPERMARKET",
            "amount_fn":   lambda: random.randint(3000, 12000),
            "frequency":   "BIWEEKLY",
            "merchant":    "Carrefour",
            "weight":      2,
        },

        # ── TRANSPORT ──
        {
            "type":        "DEBIT",
            "source":      "MPESA",
            "category":    "TRANSPORT",
            "description": f"Pay Bill Online 898920 - UBER KENYA",
            "amount_fn":   lambda: random.randint(200, 800),
            "frequency":   "WEEKLY",
            "merchant":    "Uber Kenya",
            "weight":      3,
        },
        {
            "type":        "DEBIT",
            "source":      "MPESA",
            "category":    "TRANSPORT",
            "description": "Withdraw Cash Agent 00112233 TOTAL PETROL",
            "amount_fn":   lambda: random.choice([1500, 2000, 2500, 3000]),
            "frequency":   "BIWEEKLY",
            "merchant":    "Total Petrol",
            "weight":      2,
        },

        # ── AIRTIME ──
        {
            "type":        "DEBIT",
            "source":      "MPESA",
            "category":    "AIRTIME_BUNDLES",
            "description": "Pay Bill Online 522533 - SAFARICOM POSTPAID",
            "amount_fn":   lambda: random.choice([500, 1000, 1500, 2000]),
            "frequency":   "MONTHLY",
            "day_of_month": 5,
            "merchant":    "Safaricom",
            "weight":      1,
        },
        {
            "type":        "DEBIT",
            "source":      "MPESA",
            "category":    "AIRTIME_BUNDLES",
            "description": "Airtime Purchase Safaricom",
            "amount_fn":   lambda: random.choice([50, 100, 200]),
            "frequency":   "WEEKLY",
            "merchant":    "Safaricom",
            "weight":      2,
        },

        # ── INSURANCE ──
        {
            "type":        "DEBIT",
            "source":      "MPESA",
            "category":    "INSURANCE",
            "description": "Pay Bill Online 603045 - NHIF CONTRIBUTION",
            "amount_fn":   lambda: 500,
            "day_of_month": 9,
            "frequency":   "MONTHLY",
            "merchant":    "NHIF",
            "weight":      1,
        },
        {
            "type":        "DEBIT",
            "source":      "MPESA",
            "category":    "INSURANCE",
            "description": "Pay Bill Online 195195 - NSSF CONTRIBUTION",
            "amount_fn":   lambda: 200,
            "day_of_month": 9,
            "frequency":   "MONTHLY",
            "merchant":    "NSSF",
            "weight":      1,
        },

        # ── LOAN REPAYMENT (Fuliza / M-Shwari) ──
        {
            "type":        "DEBIT",
            "source":      "MPESA",
            "category":    "LOAN_REPAYMENT",
            "description": "Pay Bill Online 777777 - FULIZA REPAYMENT",
            "amount_fn":   lambda: random.randint(200, 2000),
            "frequency":   "MONTHLY",
            "day_of_month": random.randint(1, 5),
            "merchant":    "Fuliza M-Pesa",
            "weight":      2,
        },

        # ── SAVINGS ──
        {
            "type":        "DEBIT",
            "source":      "MPESA",
            "category":    "SAVINGS",
            "description": "Pay Bill Online 777777 - M-SHWARI LOCK SAVINGS",
            "amount_fn":   lambda: random.choice([2000, 3000, 5000]),
            "day_of_month": 26,
            "frequency":   "MONTHLY",
            "merchant":    "M-Shwari",
            "weight":      1,
        },

        # ── ENTERTAINMENT ──
        {
            "type":        "DEBIT",
            "source":      "MPESA",
            "category":    "ENTERTAINMENT",
            "description": "Pay Bill Online 400200 - DSTV SUBSCRIPTION",
            "amount_fn":   lambda: random.choice([1850, 2750, 5000]),
            "day_of_month": 15,
            "frequency":   "MONTHLY",
            "merchant":    "DSTV",
            "weight":      1,
        },
        {
            "type":        "DEBIT",
            "source":      "MPESA",
            "category":    "ENTERTAINMENT",
            "description": "Buy Goods Till 445566 JAVA HOUSE RESTAURANT",
            "amount_fn":   lambda: random.randint(800, 3500),
            "frequency":   "RANDOM",
            "monthly_prob": 0.6,
            "merchant":    "Java House",
            "weight":      1,
        },

        # ── HEALTH ──
        {
            "type":        "DEBIT",
            "source":      "MPESA",
            "category":    "HEALTH",
            "description": "Buy Goods Till 334455 GOODLIFE PHARMACY",
            "amount_fn":   lambda: random.randint(300, 2500),
            "frequency":   "RANDOM",
            "monthly_prob": 0.5,
            "merchant":    "Goodlife Pharmacy",
            "weight":      1,
        },

        # ── SHOPPING ──
        {
            "type":        "DEBIT",
            "source":      "MPESA",
            "category":    "SHOPPING",
            "description": "Buy Goods Till 556677 JUMIA KENYA ONLINE",
            "amount_fn":   lambda: random.randint(1500, 8000),
            "frequency":   "RANDOM",
            "monthly_prob": 0.4,
            "merchant":    "Jumia Kenya",
            "weight":      1,
        },

        # ── MOBILE TRANSFERS (incoming) ──
        {
            "type":        "CREDIT",
            "source":      "MPESA",
            "category":    "MOBILE_TRANSFER",
            "description": f"Received from 0722{random.randint(100000,999999)} FAMILY MEMBER",
            "amount_fn":   lambda: random.choice([1000, 2000, 3000, 5000]),
            "frequency":   "RANDOM",
            "monthly_prob": 0.3,
            "merchant":    None,
            "weight":      1,
        },

        # ── ATM WITHDRAWAL ──
        {
            "type":        "DEBIT",
            "source":      "MPESA",
            "category":    "WITHDRAWAL",
            "description": "Withdraw Cash Agent 998877 NAIROBI AGENT",
            "amount_fn":   lambda: random.choice([2000, 3000, 5000, 7000, 10000]),
            "frequency":   "BIWEEKLY",
            "merchant":    None,
            "weight":      2,
        },
    ]


# ─────────────────────────────────────────────
# DATE HELPERS
# ─────────────────────────────────────────────

def date_range(start_date, end_date):
    """Generate all dates between start and end inclusive."""
    current = start_date
    while current <= end_date:
        yield current
        current += timedelta(days=1)


def random_time():
    """Generate a random Nairobi business-hours time string."""
    hour   = random.randint(7, 21)
    minute = random.randint(0, 59)
    return f"{hour:02d}:{minute:02d}"


def add_jitter(day, jitter_days=2):
    """Add ±jitter days to a day-of-month value."""
    return max(1, min(28, day + random.randint(-jitter_days, jitter_days)))


# ─────────────────────────────────────────────
# TRANSACTION BUILDER
# ─────────────────────────────────────────────

def generate_txn_id():
    return f"txn_{uuid.uuid4().hex[:12]}"


def build_transaction(template, date, account_id):
    """Build a single normalized transaction from a template and date."""
    amount = template["amount_fn"]()
    if amount <= 0:
        return None

    date_str = date.strftime("%Y-%m-%d")
    time_str = random_time()
    datetime_str = f"{date_str}T{time_str}:00+03:00" if template["source"] == "MPESA" else None

    return {
        "id":               generate_txn_id(),
        "account_id":       account_id,
        "date":             date_str,
        "datetime":         datetime_str,
        "amount":           float(amount),
        "currency":         "KES",
        "type":             template["type"],
        "source":           template["source"],
        "ingestion_method": "CSV_IMPORT",
        "raw_description":  template["description"],
        "description":      template["description"],
        "category":         template["category"],
        "merchant":         template.get("merchant"),
        "merchant_type":    None,
        "reference":        f"REF{uuid.uuid4().hex[:8].upper()}",
        "running_balance":  None,  # computed post-generation
        "is_recurring":     template.get("frequency") in ("MONTHLY", "WEEKLY", "BIWEEKLY"),
        "is_income_signal": template["type"] == "CREDIT" and template["category"] in ("SALARY", "BUSINESS_INCOME"),
        "is_anomaly":       False,
        "source_metadata":  {},
        "created_at":       datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


# ─────────────────────────────────────────────
# MAIN GENERATOR
# ─────────────────────────────────────────────

def generate_transactions(
    borrower=None,
    months=6,
    target_count=100,
):
    """
    Generate synthetic transactions for a borrower over N months.
    Aims for at least target_count transactions.
    """
    if borrower is None:
        borrower = DEFAULT_BORROWER

    account_id = borrower["account_id"]
    templates  = make_templates(borrower)
    today      = datetime.now(timezone.utc).date()
    start_date = today.replace(day=1)
    for _ in range(months - 1):
        # Go back one month
        if start_date.month == 1:
            start_date = start_date.replace(year=start_date.year - 1, month=12)
        else:
            start_date = start_date.replace(month=start_date.month - 1)
    end_date = today

    transactions = []

    for month_offset in range(months):
        # Compute current month bounds
        month_start = start_date
        for _ in range(month_offset):
            if month_start.month == 12:
                month_start = month_start.replace(year=month_start.year + 1, month=1)
            else:
                month_start = month_start.replace(month=month_start.month + 1)

        if month_start > end_date:
            break

        if month_start.month == 12:
            month_end_month = month_start.replace(year=month_start.year + 1, month=1, day=1)
        else:
            month_end_month = month_start.replace(month=month_start.month + 1, day=1)
        month_end = min(month_end_month - timedelta(days=1), end_date)

        for template in templates:
            freq = template.get("frequency", "RANDOM")

            if freq == "MONTHLY":
                target_day = template.get("day_of_month", 15)
                actual_day = add_jitter(target_day)
                try:
                    txn_date = month_start.replace(day=actual_day)
                    if month_start <= txn_date <= month_end:
                        txn = build_transaction(template, txn_date, account_id)
                        if txn:
                            transactions.append(txn)
                except ValueError:
                    pass  # day out of range for this month

            elif freq == "WEEKLY":
                # One transaction per week
                current = month_start
                while current <= month_end:
                    # Add ±1 day jitter
                    jitter  = timedelta(days=random.randint(0, 1))
                    txn_date = current + jitter
                    if txn_date <= month_end:
                        txn = build_transaction(template, txn_date, account_id)
                        if txn:
                            transactions.append(txn)
                    current += timedelta(weeks=1)

            elif freq == "BIWEEKLY":
                for week_offset in [0, 2]:
                    txn_date = month_start + timedelta(weeks=week_offset, days=random.randint(0, 3))
                    if month_start <= txn_date <= month_end:
                        txn = build_transaction(template, txn_date, account_id)
                        if txn:
                            transactions.append(txn)

            elif freq == "RANDOM":
                prob = template.get("monthly_prob", 0.5)
                if random.random() < prob:
                    # Random day in the month
                    days_in_month = (month_end - month_start).days + 1
                    random_offset = random.randint(0, days_in_month - 1)
                    txn_date = month_start + timedelta(days=random_offset)
                    txn = build_transaction(template, txn_date, account_id)
                    if txn:
                        transactions.append(txn)

    # Sort by date
    transactions.sort(key=lambda t: (t["date"], t["datetime"] or ""))

    # Compute running balance
    balance = round(borrower["monthly_salary"] * 0.5)  # start with ~half salary as opening balance
    for txn in transactions:
        if txn["type"] == "CREDIT":
            balance += txn["amount"]
        else:
            balance -= txn["amount"]
        txn["running_balance"] = max(0, round(balance, 2))

    # Inject one anomaly — a large unexplained withdrawal
    if len(transactions) > 20:
        anomaly_idx = random.randint(len(transactions) // 2, len(transactions) - 1)
        anomaly = deepcopy(transactions[anomaly_idx])
        anomaly["id"]          = generate_txn_id()
        anomaly["type"]        = "DEBIT"
        anomaly["amount"]      = round(borrower["monthly_salary"] * random.uniform(0.8, 1.2))
        anomaly["category"]    = "WITHDRAWAL"
        anomaly["description"] = "Withdraw Cash Agent 009988 UNKNOWN AGENT"
        anomaly["raw_description"] = anomaly["description"]
        anomaly["is_anomaly"]  = True
        anomaly["is_recurring"] = False
        transactions.insert(anomaly_idx + 1, anomaly)

    # If we're still under target, pad with small M-Pesa transactions
    while len(transactions) < target_count:
        rand_day  = random.randint(0, (end_date - start_date).days)
        txn_date  = start_date + timedelta(days=rand_day)
        amount    = random.choice([50, 100, 150, 200, 300])
        direction = random.choice(["CREDIT", "DEBIT"])
        pad_txn   = {
            "id":               generate_txn_id(),
            "account_id":       account_id,
            "date":             txn_date.strftime("%Y-%m-%d"),
            "datetime":         f"{txn_date.strftime('%Y-%m-%d')}T{random_time()}:00+03:00",
            "amount":           float(amount),
            "currency":         "KES",
            "type":             direction,
            "source":           "MPESA",
            "ingestion_method": "CSV_IMPORT",
            "raw_description":  "Airtime Purchase Safaricom" if direction == "DEBIT" else f"Received from 0733{random.randint(100000,999999)}",
            "description":      "Airtime Purchase Safaricom" if direction == "DEBIT" else "M-Pesa Received",
            "category":         "AIRTIME_BUNDLES" if direction == "DEBIT" else "MOBILE_TRANSFER",
            "merchant":         "Safaricom" if direction == "DEBIT" else None,
            "merchant_type":    "telco" if direction == "DEBIT" else "peer",
            "reference":        f"REF{uuid.uuid4().hex[:8].upper()}",
            "running_balance":  None,
            "is_recurring":     False,
            "is_income_signal": False,
            "is_anomaly":       False,
            "source_metadata":  {},
            "created_at":       datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        transactions.append(pad_txn)

    transactions.sort(key=lambda t: t["date"])
    return transactions


# ─────────────────────────────────────────────
# OUTPUT FORMATTERS
# ─────────────────────────────────────────────

def to_json(transactions, borrower):
    return json.dumps({
        "account_id":   borrower["account_id"],
        "borrower":     borrower["name"],
        "description":  borrower["description"],
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "total":        len(transactions),
        "period": {
            "from": transactions[0]["date"] if transactions else None,
            "to":   transactions[-1]["date"] if transactions else None,
        },
        "transactions": transactions,
    }, indent=2)


def to_csv(transactions):
    if not transactions:
        return ""
    fields = [
        "id", "account_id", "date", "datetime", "amount", "currency",
        "type", "source", "ingestion_method", "raw_description", "description",
        "category", "merchant", "merchant_type", "reference", "running_balance",
        "is_recurring", "is_income_signal", "is_anomaly", "created_at",
    ]
    import io
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(transactions)
    return buf.getvalue()


def to_sql(transactions, borrower):
    """Generate INSERT statements for seeding the demo database."""
    lines = [
        f"-- KipaAPI Demo Seed Data",
        f"-- Borrower: {borrower['name']} ({borrower['account_id']})",
        f"-- Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}",
        f"-- Total: {len(transactions)} transactions",
        "",
        "BEGIN;",
        "",
    ]
    for t in transactions:
        desc     = t["raw_description"].replace("'", "''")
        merchant = f"'{t['merchant']}'" if t["merchant"] else "NULL"
        mtype    = f"'{t['merchant_type']}'" if t["merchant_type"] else "NULL"
        ref      = f"'{t['reference']}'" if t["reference"] else "NULL"
        bal      = str(t["running_balance"]) if t["running_balance"] is not None else "NULL"
        dt       = f"'{t['datetime']}'" if t["datetime"] else "NULL"

        lines.append(
            f"INSERT INTO transactions "
            f"(id, account_id, date, datetime, amount, currency, type, source, "
            f"ingestion_method, raw_description, description, category, merchant, "
            f"merchant_type, reference, running_balance, is_recurring, is_income_signal, "
            f"is_anomaly, source_metadata, created_at) VALUES ("
            f"'{t['id']}', '{t['account_id']}', '{t['date']}', {dt}, "
            f"{t['amount']}, 'KES', '{t['type']}', '{t['source']}', "
            f"'{t['ingestion_method']}', '{desc}', '{desc}', '{t['category']}', "
            f"{merchant}, {mtype}, {ref}, {bal}, "
            f"{str(t['is_recurring']).upper()}, {str(t['is_income_signal']).upper()}, "
            f"{str(t['is_anomaly']).upper()}, '{{}}', '{t['created_at']}'"
            f");"
        )

    lines += ["", "COMMIT;"]
    return "\n".join(lines)


# ─────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate KipaAPI synthetic test data")
    parser.add_argument("--count",    type=int,   default=100,          help="Minimum number of transactions")
    parser.add_argument("--months",   type=int,   default=6,            help="Number of months of history")
    parser.add_argument("--borrower", type=int,   default=0,            help="Borrower profile index (0, 1, 2)")
    parser.add_argument("--format",   type=str,   default="json",       help="Output format: json | csv | sql")
    parser.add_argument("--output",   type=str,   default=None,         help="Output file path (default: print to stdout)")
    parser.add_argument("--all",      action="store_true",              help="Generate all 3 borrower profiles")
    args = parser.parse_args()

    if args.all:
        # Generate all profiles
        all_results = {}
        for b in BORROWER_PROFILES:
            txns = generate_transactions(borrower=b, months=args.months, target_count=args.count)
            all_results[b["account_id"]] = {
                "borrower":     b["name"],
                "total":        len(txns),
                "transactions": txns,
            }
            print(f"  ✓ {b['name']} ({b['account_id']}): {len(txns)} transactions")

        output = json.dumps(all_results, indent=2)
        filename = args.output or "all_borrowers.json"
        with open(filename, "w") as f:
            f.write(output)
        print(f"\nSaved to {filename}")

    else:
        borrower = BORROWER_PROFILES[args.borrower % len(BORROWER_PROFILES)]
        txns = generate_transactions(borrower=borrower, months=args.months, target_count=args.count)

        print(f"Generated {len(txns)} transactions for {borrower['name']}", flush=True)

        if args.format == "json":
            output = to_json(txns, borrower)
        elif args.format == "csv":
            output = to_csv(txns)
        elif args.format == "sql":
            output = to_sql(txns, borrower)
        else:
            print(f"Unknown format: {args.format}")
            exit(1)

        if args.output:
            with open(args.output, "w") as f:
                f.write(output)
            print(f"Saved to {args.output}")
        else:
            # Print summary instead of full dump to stdout
            if args.format == "json":
                data = json.loads(output)
                print(f"Period:       {data['period']['from']} to {data['period']['to']}")
                print(f"Borrower:     {data['borrower']}")
                print(f"Total txns:   {data['total']}")
                cats = {}
                for t in data["transactions"]:
                    cats[t["category"]] = cats.get(t["category"], 0) + 1
                print(f"\nCategory breakdown:")
                for cat, count in sorted(cats.items(), key=lambda x: -x[1]):
                    print(f"  {cat:<25} {count}")
                print(f"\nRun with --output transactions.json to save full dataset")
            else:
                print(output)
