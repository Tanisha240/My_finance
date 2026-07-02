from flask import Flask, render_template, request, jsonify, session, redirect, url_for
import database

app = Flask(__name__)
app.secret_key = 'aether_secret_key_987!_super_secure_key'

# Initialize DB on startup (runs migrations if needed)
database.init_db()

@app.route('/')
def index():
    if 'username' not in session:
        return redirect(url_for('login_page'))
    return render_template('index.html')

@app.route('/login')
def login_page():
    if 'username' in session:
        return redirect(url_for('index'))
    return render_template('login.html')

# Authentication APIs
@app.route('/api/auth/login', methods=['POST'])
def api_login():
    data = request.get_json()
    if not data or 'username' not in data or 'password' not in data:
        return jsonify({'error': 'Missing username or password'}), 400
        
    username = data['username'].strip()
    password = data['password']
    
    if database.verify_user(username, password):
        session['username'] = username
        return jsonify({'message': 'Logged in successfully'})
    return jsonify({'error': 'Invalid username or password'}), 401

@app.route('/api/auth/signup', methods=['POST'])
def api_signup():
    data = request.get_json()
    if not data or 'username' not in data or 'password' not in data:
        return jsonify({'error': 'Missing username or password'}), 400
        
    username = data['username'].strip()
    password = data['password']
    currency = data.get('currency', 'USD')
    
    if len(username) < 3:
        return jsonify({'error': 'Username must be at least 3 characters'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400
        
    success = database.create_user(username, password, currency)
    if success:
        session['username'] = username
        return jsonify({'message': 'User registered successfully'}), 211
    return jsonify({'error': 'Username is already taken'}), 409

@app.route('/api/auth/logout', methods=['POST'])
def api_logout():
    session.pop('username', None)
    return jsonify({'message': 'Logged out successfully'})

@app.route('/api/auth/me', methods=['GET'])
def api_me():
    if 'username' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    profile = database.get_user_profile(session['username'])
    if profile:
        return jsonify(profile)
    return jsonify({'error': 'User not found'}), 404

# User Settings API
@app.route('/api/user/currency', methods=['POST'])
def api_update_currency():
    if 'username' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
        
    data = request.get_json()
    if not data or 'currency' not in data:
        return jsonify({'error': 'Missing currency field'}), 400
        
    currency = data['currency']
    success = database.update_user_currency(session['username'], currency)
    if success:
        return jsonify({'message': 'Currency updated successfully'})
    return jsonify({'error': 'Failed to update currency'}), 500

# Transactions API
@app.route('/api/transactions', methods=['GET'])
def get_transactions():
    if 'username' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    category = request.args.get('category')
    tx_type = request.args.get('type')
    txs = database.get_all_transactions(session['username'], category, tx_type)
    return jsonify(txs)

@app.route('/api/transactions/<int:tx_id>', methods=['GET'])
def get_transaction(tx_id):
    if 'username' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    tx = database.get_transaction_by_id(session['username'], tx_id)
    if tx:
        return jsonify(tx)
    return jsonify({'error': 'Transaction not found'}), 404

@app.route('/api/transactions', methods=['POST'])
def add_transaction():
    if 'username' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json()
    if not data or not all(k in data for k in ('type', 'amount', 'category', 'date')):
        return jsonify({'error': 'Missing required fields'}), 400
        
    try:
        amount = float(data['amount'])
    except ValueError:
        return jsonify({'error': 'Amount must be a number'}), 400
        
    tx_id = database.add_transaction(
        session['username'],
        data['type'],
        amount,
        data['category'],
        data['date'],
        data.get('description', '')
    )
    return jsonify({'id': tx_id, 'message': 'Transaction added successfully'}), 211

@app.route('/api/transactions/<int:tx_id>', methods=['PUT'])
def update_transaction(tx_id):
    if 'username' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json()
    if not data or not all(k in data for k in ('type', 'amount', 'category', 'date')):
        return jsonify({'error': 'Missing required fields'}), 400
        
    try:
        amount = float(data['amount'])
    except ValueError:
        return jsonify({'error': 'Amount must be a number'}), 400
        
    success = database.update_transaction(
        session['username'],
        tx_id,
        data['type'],
        amount,
        data['category'],
        data['date'],
        data.get('description', '')
    )
    if success:
        return jsonify({'message': 'Transaction updated successfully'})
    return jsonify({'error': 'Transaction not found or not modified'}), 404

@app.route('/api/transactions/<int:tx_id>', methods=['DELETE'])
def delete_transaction(tx_id):
    if 'username' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    success = database.delete_transaction(session['username'], tx_id)
    if success:
        return jsonify({'message': 'Transaction deleted successfully'})
    return jsonify({'error': 'Transaction not found'}), 404

# Budgets API
@app.route('/api/budgets', methods=['GET'])
def get_budgets():
    if 'username' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    budgets = database.get_all_budgets(session['username'])
    return jsonify(budgets)

@app.route('/api/budgets', methods=['POST'])
def set_budget():
    if 'username' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json()
    if not data or 'category' not in data or 'amount' not in data:
        return jsonify({'error': 'Missing required fields'}), 400
        
    try:
        amount = float(data['amount'])
    except ValueError:
        return jsonify({'error': 'Amount must be a number'}), 400
        
    database.set_budget(session['username'], data['category'], amount)
    return jsonify({'message': 'Budget set successfully'})

@app.route('/api/budgets/<string:category>', methods=['DELETE'])
def delete_budget(category):
    if 'username' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    success = database.delete_budget(session['username'], category)
    if success:
        return jsonify({'message': 'Budget deleted successfully'})
    return jsonify({'error': 'Budget not found'}), 404

# Goals API
@app.route('/api/goals', methods=['GET'])
def get_goals():
    if 'username' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    goals = database.get_all_goals(session['username'])
    return jsonify(goals)

@app.route('/api/goals', methods=['POST'])
def add_goal():
    if 'username' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json()
    if not data or not all(k in data for k in ('name', 'target_amount', 'target_date')):
        return jsonify({'error': 'Missing required fields'}), 400
        
    try:
        target_amount = float(data['target_amount'])
        current_amount = float(data.get('current_amount', 0.0))
    except ValueError:
        return jsonify({'error': 'Amounts must be numbers'}), 400
        
    goal_id = database.add_goal(
        session['username'],
        data['name'],
        target_amount,
        current_amount,
        data['target_date']
    )
    return jsonify({'id': goal_id, 'message': 'Savings goal created successfully'}), 211

@app.route('/api/goals/<int:goal_id>', methods=['PUT'])
def update_goal(goal_id):
    if 'username' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json()
    if not data or not all(k in data for k in ('name', 'target_amount', 'current_amount', 'target_date')):
        return jsonify({'error': 'Missing required fields'}), 400
        
    try:
        target_amount = float(data['target_amount'])
        current_amount = float(data['current_amount'])
    except ValueError:
        return jsonify({'error': 'Amounts must be numbers'}), 400
        
    success = database.update_goal(
        session['username'],
        goal_id,
        data['name'],
        target_amount,
        current_amount,
        data['target_date']
    )
    if success:
        return jsonify({'message': 'Savings goal updated successfully'})
    return jsonify({'error': 'Goal not found or not modified'}), 404

@app.route('/api/goals/<int:goal_id>', methods=['DELETE'])
def delete_goal(goal_id):
    if 'username' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    success = database.delete_goal(session['username'], goal_id)
    if success:
        return jsonify({'message': 'Savings goal deleted successfully'})
    return jsonify({'error': 'Goal not found'}), 404

# Summary API
@app.route('/api/summary', methods=['GET'])
def get_summary():
    if 'username' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    summary = database.get_summary_statistics(session['username'])
    return jsonify(summary)

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
