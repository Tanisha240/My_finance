import os
import json
import base64
import urllib.request
import urllib.error
import fnmatch

def load_credentials():
    cred_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'github_credentials.json')
    if not os.path.exists(cred_path):
        print(f"Error: {cred_path} not found. Please create it.")
        return None
    with open(cred_path, 'r', encoding='utf-8') as f:
        return json.load(f)

def load_gitignore_patterns():
    patterns = ['.git', '.venv', '__pycache__', '*.db', '*.pyc', 'github_credentials.json']
    gitignore_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.gitignore')
    if os.path.exists(gitignore_path):
        with open(gitignore_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    patterns.append(line)
    return list(set(patterns))

def should_ignore(path, root_dir, ignore_patterns):
    rel_path = os.path.relpath(path, root_dir).replace('\\', '/')
    parts = rel_path.split('/')
    
    for pattern in ignore_patterns:
        # Normalize pattern
        pattern = pattern.rstrip('/')
        
        # Check if any part of the path matches
        for part in parts:
            if fnmatch.fnmatch(part, pattern):
                return True
        
        # Check if the full relative path matches
        if fnmatch.fnmatch(rel_path, pattern):
            return True
        if fnmatch.fnmatch(rel_path, pattern + '/*'):
            return True
            
    return False

def get_project_files(root_dir, ignore_patterns):
    project_files = []
    for root, dirs, files in os.walk(root_dir):
        # Filter directories in-place to prevent os.walk from traversing ignored dirs
        dirs[:] = [d for d in dirs if not should_ignore(os.path.join(root, d), root_dir, ignore_patterns)]
        
        for file in files:
            file_path = os.path.join(root, file)
            if not should_ignore(file_path, root_dir, ignore_patterns):
                project_files.append(file_path)
    return project_files

import ssl

def github_request(url, token, data=None, method='GET'):
    req = urllib.request.Request(url, method=method)
    req.add_header('Authorization', f'token {token}')
    req.add_header('Accept', 'application/vnd.github.v3+json')
    req.add_header('User-Agent', 'python-urllib-github-uploader')
    
    # Bypass SSL verification issues by using unverified context
    context = ssl._create_unverified_context()
    
    if data is not None:
        req.add_header('Content-Type', 'application/json')
        json_data = json.dumps(data).encode('utf-8')
        try:
            with urllib.request.urlopen(req, data=json_data, context=context) as response:
                return response.status, json.loads(response.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            err_msg = e.read().decode('utf-8')
            try:
                err_json = json.loads(err_msg)
                return e.code, err_json
            except Exception:
                return e.code, {"message": err_msg}
    else:
        try:
            with urllib.request.urlopen(req, context=context) as response:
                return response.status, json.loads(response.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            err_msg = e.read().decode('utf-8')
            try:
                err_json = json.loads(err_msg)
                return e.code, err_json
            except Exception:
                return e.code, {"message": err_msg}

def main():
    print("Loading credentials...")
    creds = load_credentials()
    if not creds:
        return
        
    token = creds.get('token')
    username = creds.get('username')
    repo_name = creds.get('repo_name')
    is_private = creds.get('private', True)
    
    if "YOUR_GITHUB_" in token or "YOUR_GITHUB_" in username:
        print("Error: Please replace the placeholder values in github_credentials.json with your actual GitHub username and Personal Access Token.")
        return

    root_dir = os.path.dirname(os.path.abspath(__file__))
    ignore_patterns = load_gitignore_patterns()
    
    print(f"Scanning directory: {root_dir}")
    files_to_upload = get_project_files(root_dir, ignore_patterns)
    
    print("\nFiles queued for upload:")
    for f in files_to_upload:
        print(f" - {os.path.relpath(f, root_dir)}")
    print(f"Total files: {len(files_to_upload)}")
    
    # 1. Check if repository exists, if not create it
    repo_url = f"https://api.github.com/repos/{username}/{repo_name}"
    print(f"\nChecking if repository {username}/{repo_name} exists...")
    status, res = github_request(repo_url, token, method='GET')
    
    if status == 404:
        print(f"Repository {repo_name} does not exist. Creating repository...")
        create_url = "https://api.github.com/user/repos"
        create_data = {
            "name": repo_name,
            "private": is_private,
            "description": "Personal Financial Management website built using HTML, CSS, JS, and Python Flask",
            "auto_init": False
        }
        create_status, create_res = github_request(create_url, token, data=create_data, method='POST')
        if create_status not in [200, 201]:
            print(f"Failed to create repository: {create_res.get('message')}")
            return
        print(f"Successfully created repository: {create_res.get('html_url')}")
    elif status == 200:
        print("Repository already exists. Proceeding to update/upload files...")
    else:
        print(f"Error checking repository status: {res.get('message')}")
        return

    # 2. Upload files
    print("\nUploading files to GitHub...")
    for f in files_to_upload:
        rel_path = os.path.relpath(f, root_dir).replace('\\', '/')
        file_api_url = f"https://api.github.com/repos/{username}/{repo_name}/contents/{rel_path}"
        
        # Read file contents and base64 encode
        with open(f, 'rb') as file_obj:
            content_bytes = file_obj.read()
            encoded_content = base64.b64encode(content_bytes).decode('utf-8')
            
        # Check if the file already exists on GitHub to get its SHA (needed for updates)
        file_sha = None
        check_status, check_res = github_request(file_api_url, token, method='GET')
        if check_status == 200:
            file_sha = check_res.get('sha')
            
        # Prepare upload payload
        upload_data = {
            "message": f"Upload {rel_path} via API",
            "content": encoded_content
        }
        if file_sha:
            upload_data["sha"] = file_sha
            
        put_status, put_res = github_request(file_api_url, token, data=upload_data, method='PUT')
        if put_status in [200, 201]:
            action_str = "Updated" if file_sha else "Created"
            print(f" [{action_str}] {rel_path}")
        else:
            print(f" [Error] Failed to upload {rel_path}: {put_res.get('message')}")
            
    print("\nUpload complete! Your code is now available on GitHub.")
    print(f"Visit: https://github.com/{username}/{repo_name}")

if __name__ == '__main__':
    main()
