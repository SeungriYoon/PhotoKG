#!/usr/bin/env python3
"""
PhotoRAG Knowledge Graph System - Setup Script
Automated setup for development and production environments
"""

import os
import sys
import subprocess
import platform
from pathlib import Path

def run_command(command, cwd=None):
    """Run shell command and return success status"""
    try:
        result = subprocess.run(command, shell=True, cwd=cwd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Error running: {command}")
            print(f"Error: {result.stderr}")
            return False
        return True
    except Exception as e:
        print(f"Exception running {command}: {e}")
        return False

def check_dependencies():
    """Check if required dependencies are installed"""
    print("🔍 Checking dependencies...")

    # Check Python
    python_version = sys.version_info
    if python_version < (3, 8):
        print("❌ Python 3.8+ is required")
        return False
    print(f"✅ Python {python_version.major}.{python_version.minor}.{python_version.micro}")

    # Check Node.js
    if not run_command("node --version"):
        print("❌ Node.js is not installed or not in PATH")
        return False
    print("✅ Node.js is available")

    # Check npm
    if not run_command("npm --version"):
        print("❌ npm is not installed or not in PATH")
        return False
    print("✅ npm is available")

    return True

def setup_backend():
    """Setup backend dependencies"""
    print("\n📦 Setting up backend...")
    backend_dir = Path("backend")

    if not backend_dir.exists():
        print("❌ Backend directory not found")
        return False

    # Install npm dependencies
    if not run_command("npm install", cwd=backend_dir):
        print("❌ Failed to install backend dependencies")
        return False

    print("✅ Backend dependencies installed")
    return True

def setup_python():
    """Setup Python virtual environment and dependencies"""
    print("\n🐍 Setting up Python environment...")

    # Create virtual environment if it doesn't exist
    if not Path("venv").exists():
        print("Creating virtual environment...")
        if not run_command(f"{sys.executable} -m venv venv"):
            print("❌ Failed to create virtual environment")
            return False

    # Determine activation script
    if platform.system() == "Windows":
        activate_script = "venv\\Scripts\\activate"
        pip_command = "venv\\Scripts\\pip"
    else:
        activate_script = "source venv/bin/activate"
        pip_command = "venv/bin/pip"

    # Install Python dependencies
    print("Installing Python packages...")
    if not run_command(f"{pip_command} install -r requirements.txt"):
        print("❌ Failed to install Python dependencies")
        return False

    print("✅ Python environment setup complete")
    return True

def setup_frontend():
    """Setup frontend dependencies"""
    print("\n🌐 Setting up frontend...")

    # Install frontend dependencies (if any)
    if Path("package.json").exists():
        if not run_command("npm install"):
            print("❌ Failed to install frontend dependencies")
            return False

    print("✅ Frontend setup complete")
    return True

def create_env_file():
    """Create .env file if it doesn't exist"""
    print("\n⚙️ Setting up environment configuration...")

    if not Path(".env").exists():
        if Path(".env.example").exists():
            # Copy example file
            with open(".env.example", "r") as src, open(".env", "w") as dst:
                dst.write(src.read())
            print("✅ Created .env file from .env.example")
            print("⚠️  Please update .env file with your actual API keys")
        else:
            print("❌ No .env.example file found")
            return False
    else:
        print("✅ .env file already exists")

    return True

def main():
    """Main setup function"""
    print("🚀 PhotoRAG Knowledge Graph System Setup")
    print("=" * 50)

    # Check if we're in the right directory
    if not Path("README.md").exists():
        print("❌ Please run this script from the project root directory")
        sys.exit(1)

    # Check dependencies
    if not check_dependencies():
        print("\n❌ Dependency check failed. Please install required software.")
        sys.exit(1)

    # Setup components
    success = True
    success &= setup_backend()
    success &= setup_python()
    success &= setup_frontend()
    success &= create_env_file()

    if success:
        print("\n🎉 Setup completed successfully!")
        print("\nNext steps:")
        print("1. Update .env file with your API keys")
        print("2. Start backend: cd backend && npm start")
        print("3. Start frontend: npm start")
        print("4. Open http://localhost:3000 in your browser")
    else:
        print("\n❌ Setup failed. Please check the errors above.")
        sys.exit(1)

if __name__ == "__main__":
    main()