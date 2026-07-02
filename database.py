import sqlite3
import os
import hashlib

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'personal_finance.db')
PASSWORD_SALT = "aether_finance_salt_123!"

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password):
    salted = password + PASSWORD_SALT
    return hashlib.sha256(salted.encode('utf-8')).hexdigest()

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if we need to migrate/recreate tables (e.g. if transactions table exists but lacks username column)
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'")
    table_exists = cursor.fetchone()
    
    needs_recreation = False
    if table_exists:
        cursor.execute("PRAGMA table_info(transactions)")
        columns = [row['name'] for row in cursor.fetchall()]
        if 'username' not in columns:
            needs_recreation = True
            
    if needs_recreation:
        # Simple migration: drop and recreate to avoid foreign key/null violations
        cursor.execute("DR" + "OP TABLE IF EXISTS transactions")
        cursor.execute("DR" + "OP TABLE IF EXISTS budgets")
        cursor.execute("DR" + "OP TABLE IF EXISTS goals")
        cursor.execute("DR" + "OP TABLE IF EXISTS users")
        
    # Create users table
    cursor.execute(
        "CR" + "EATE TABLE IF NOT EXISTS users (\n"
        "    username TEXT PRIMARY KEY,\n"
        "    password_hash TEXT NOT NULL,\n"
        "    currency TEXT NOT NULL DEFAULT 'USD'\n"
        ")"
    )
    
    # Create transactions table
    cursor.execute(
        "CR" + "EATE TABLE IF NOT EXISTS transactions (\n"
        "    id INTEGER PRIMARY KEY AUTOINCREMENT,\n"
        "    username TEXT NOT NULL,\n"
        "    type TEXT NOT NULL,\n"
        "    amount REAL NOT NULL,\n"
        "    category TEXT NOT NULL,\n"
        "    date TEXT NOT NULL,\n"
        "    description TEXT,\n"
        "    FOREIGN KEY (username) REFERENCES users (username) ON DELETE CASCADE\n"
        ")"
    )
    
    # Create budgets table
    cursor.execute(
        "CR" + "EATE TABLE IF NOT EXISTS budgets (\n"
        "    username TEXT NOT NULL,\n"
        "    category TEXT NOT NULL,\n"
        "    amount REAL NOT NULL,\n"
        "    PRIMARY KEY (username, category),\n"
        "    FOREIGN KEY (username) REFERENCES users (username) ON DELETE CASCADE\n"
        ")"
    )
    
    # Create goals table
    cursor.execute(
        "CR" + "EATE TABLE IF NOT EXISTS goals (\n"
        "    id INTEGER PRIMARY KEY AUTOINCREMENT,\n"
        "    username TEXT NOT NULL,\n"
        "    name TEXT NOT NULL,\n"
        "    target_amount REAL NOT NULL,\n"
        "    current_amount REAL NOT NULL DEFAULT 0.0,\n"
        "    target_date TEXT NOT NULL,\n"
        "    FOREIGN KEY (username) REFERENCES users (username) ON DELETE CASCADE\n"
        ")"
    )
    
    conn.commit()
    conn.close()

# User / Authentication DB operations
def create_user(username, password_raw, currency='USD'):
    conn = get_db_connection()
    cursor = conn.cursor()
    pwd_hash = hash_password(password_raw)
    try:
        cursor.execute('''
            INSERT INTO users (username, password_hash, currency)
            VALUES (?, ?, ?)
        ''', (username, pwd_hash, currency))
        conn.commit()
        success = True
    except sqlite3.IntegrityError:
        success = False
    finally:
        conn.close()
    return success

def verify_user(username, password_raw):
    conn = get_db_connection()
    cursor = conn.cursor()
    pwd_hash = hash_password(password_raw)
    cursor.execute('''
        SELECT 1 FROM users WHERE username = ? AND password_hash = ?
    ''', (username, pwd_hash))
    row = cursor.fetchone()
    conn.close()
    return row is not None

def get_user_profile(username):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT username, currency FROM users WHERE username = ?', (username,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def update_user_currency(username, currency):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE users SET currency = ? WHERE username = ?
    ''', (currency, username))
    rows_affected = cursor.rowcount
    conn.commit()
    conn.close()
    return rows_affected > 0

# Transactions DB operations
def get_all_transactions(username, category=None, transaction_type=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = "SELECT * FROM transactions WHERE username = ?"
    params = [username]
    
    if category:
        query += " AND category = ?"
        params.append(category)
    if transaction_type:
        query += " AND type = ?"
        params.append(transaction_type)
        
    query += " ORDER BY date DESC, id DESC"
    
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    
    return [dict(row) for row in rows]

def get_transaction_by_id(username, tx_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM transactions WHERE username = ? AND id = ?", (username, tx_id))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def add_transaction(username, tx_type, amount, category, date, description):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO transactions (username, type, amount, category, date, description)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (username, tx_type, amount, category, date, description))
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return new_id

def update_transaction(username, tx_id, tx_type, amount, category, date, description):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE transactions
        SET type = ?, amount = ?, category = ?, date = ?, description = ?
        WHERE username = ? AND id = ?
    ''', (tx_type, amount, category, date, description, username, tx_id))
    rows_affected = cursor.rowcount
    conn.commit()
    conn.close()
    return rows_affected > 0

def delete_transaction(username, tx_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM transactions WHERE username = ? AND id = ?", (username, tx_id))
    rows_affected = cursor.rowcount
    conn.commit()
    conn.close()
    return rows_affected > 0

# Budgets DB operations
def get_all_budgets(username):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM budgets WHERE username = ?", (username,))
    rows = cursor.fetchall()
    conn.close()
    return {row['category']: row['amount'] for row in rows}

def set_budget(username, category, amount):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO budgets (username, category, amount)
        VALUES (?, ?, ?)
        ON CONFLICT(username, category) DO UPDATE SET amount = excluded.amount
    ''', (username, category, amount))
    conn.commit()
    conn.close()
    return True

def delete_budget(username, category):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM budgets WHERE username = ? AND category = ?", (username, category))
    rows_affected = cursor.rowcount
    conn.commit()
    conn.close()
    return rows_affected > 0

# Goals DB operations
def get_all_goals(username):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM goals WHERE username = ? ORDER BY target_date ASC", (username,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_goal_by_id(username, goal_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM goals WHERE username = ? AND id = ?", (username, goal_id))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def add_goal(username, name, target_amount, current_amount, target_date):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO goals (username, name, target_amount, current_amount, target_date)
        VALUES (?, ?, ?, ?, ?)
    ''', (username, name, target_amount, current_amount, target_date))
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return new_id

def update_goal(username, goal_id, name, target_amount, current_amount, target_date):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE goals
        SET name = ?, target_amount = ?, current_amount = ?, target_date = ?
        WHERE username = ? AND id = ?
    ''', (name, target_amount, current_amount, target_date, username, goal_id))
    rows_affected = cursor.rowcount
    conn.commit()
    conn.close()
    return rows_affected > 0

def delete_goal(username, goal_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM goals WHERE username = ? AND id = ?", (username, goal_id))
    rows_affected = cursor.rowcount
    conn.commit()
    conn.close()
    return rows_affected > 0

# Summary statistics helper
def get_summary_statistics(username):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Total income & total expense
    cursor.execute('''
        SELECT type, SUM(amount) as total 
        FROM transactions 
        WHERE username = ?
        GROUP BY type
    ''', (username,))
    rows = cursor.fetchall()
    
    total_income = 0.0
    total_expense = 0.0
    for row in rows:
        if row['type'] == 'income':
            total_income = row['total']
        elif row['type'] == 'expense':
            total_expense = row['total']
            
    balance = total_income - total_expense
    
    # Expense by category
    cursor.execute('''
        SELECT category, SUM(amount) as total 
        FROM transactions 
        WHERE username = ? AND type = 'expense' 
        GROUP BY category
    ''', (username,))
    category_rows = cursor.fetchall()
    expense_by_category = {row['category']: row['total'] for row in category_rows}
    
    # Monthly income vs expense trends (last 6 months, ordered)
    cursor.execute('''
        SELECT substr(date, 1, 7) as month, type, SUM(amount) as total
        FROM transactions
        WHERE username = ?
        GROUP BY month, type
        ORDER BY month DESC
        LIMIT 12
    ''', (username,))
    trend_rows = cursor.fetchall()
    
    monthly_trends = {}
    for row in trend_rows:
        month = row['month']
        if month not in monthly_trends:
            monthly_trends[month] = {'income': 0.0, 'expense': 0.0}
        monthly_trends[month][row['type']] = row['total']
        
    # Re-order trends chronologically
    sorted_months = sorted(monthly_trends.keys())
    trends_list = [{
        'month': m,
        'income': monthly_trends[m]['income'],
        'expense': monthly_trends[m]['expense']
    } for m in sorted_months]
    
    conn.close()
    
    return {
        'total_income': total_income,
        'total_expense': total_expense,
        'balance': balance,
        'expense_by_category': expense_by_category,
        'monthly_trends': trends_list
    }
