/**
 * UI Management Module
 * Manages the console, status display, and user interface.
 */

class UIManager {
    constructor() {
        this.console = null;
        this.statusElement = null;
    }

    init() {
        this.setupConsole();
        this.setupStatusDisplay();
    }

    setupConsole() {
        this.console = {
            log: (message) => this.addConsoleMessage(message, 'info'),
            error: (message) => this.addConsoleMessage(message, 'error'),
            warning: (message) => this.addConsoleMessage(message, 'warning'),
            success: (message) => this.addConsoleMessage(message, 'success')
        };
    }

    setupStatusDisplay() {
        // Set up the status display element if it exists
        const statusElement = document.querySelector('.status-display');
        if (statusElement) {
            this.statusElement = statusElement;
        }
    }

    addConsoleMessage(message, type = 'info') {
        const consoleContent = document.getElementById('consoleContent');
        if (!consoleContent) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `console-message ${type}`;
        
        const timestamp = new Date().toLocaleTimeString();
        const icon = this.getConsoleIcon(type);
        
        messageDiv.innerHTML = `
            <span class="console-timestamp">${timestamp}</span>
            <span class="console-icon">${icon}</span>
            <span class="console-text">${message}</span>
        `;

        consoleContent.appendChild(messageDiv);
        
        // Scroll to the bottom
        consoleContent.scrollTop = consoleContent.scrollHeight;
        
        // Keep a maximum of 100 messages
        const messages = consoleContent.querySelectorAll('.console-message');
        if (messages.length > 100) {
            messages[0].remove();
        }
    }

    getConsoleIcon(type) {
        const icons = {
            'info': 'ℹ️',
            'error': '❌',
            'warning': '⚠️',
            'success': '✅'
        };
        return icons[type] || icons['info'];
    }

    log(message) {
        this.addConsoleMessage(message, 'info');
    }

    error(message) {
        this.addConsoleMessage(message, 'error');
    }

    warning(message) {
        this.addConsoleMessage(message, 'warning');
    }

    success(message) {
        this.addConsoleMessage(message, 'success');
    }

    updateStatus(message) {
        if (this.statusElement) {
            this.statusElement.textContent = message;
        }
    }

    showLoading(show = true) {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = show ? 'flex' : 'none';
        }
    }

    updateProgress(percent) {
        const progressFill = document.getElementById('progressFill');
        if (progressFill) {
            progressFill.style.width = `${percent}%`;
        }
    }

    showNotification(message, type = 'info', duration = 5000) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">${this.getConsoleIcon(type)}</span>
                <span class="notification-text">${message}</span>
                <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;

        // Apply styles
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            background: ${this.getNotificationColor(type)};
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            font-size: 14px;
            max-width: 400px;
            animation: slideIn 0.3s ease-out;
        `;

        // Add animation styles
        if (!document.getElementById('notification-styles')) {
            const style = document.createElement('style');
            style.id = 'notification-styles';
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                .notification-content {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .notification-icon {
                    font-size: 16px;
                }
                .notification-text {
                    flex: 1;
                }
                .notification-close {
                    background: none;
                    border: none;
                    color: white;
                    font-size: 18px;
                    cursor: pointer;
                    padding: 0;
                    width: 20px;
                    height: 20px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .notification-close:hover {
                    background: rgba(255,255,255,0.2);
                    border-radius: 50%;
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(notification);

        // Auto-remove
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, duration);
    }

    getNotificationColor(type) {
        const colors = {
            'info': '#2196F3',
            'error': '#f44336',
            'warning': '#ff9800',
            'success': '#4CAF50'
        };
        return colors[type] || colors['info'];
    }

    // Update file upload status
    updateFileStatus(message, type = 'info') {
        const fileStatus = document.getElementById('fileStatus');
        if (fileStatus) {
            fileStatus.textContent = message;
            fileStatus.className = `file-status ${type}`;
        }
    }

    // Update Ollama status
    updateOllamaStatus(success, message) {
        const statusDiv = document.getElementById('ollamaStatus');
        if (statusDiv) {
            statusDiv.textContent = message;
            statusDiv.className = `status-indicator ${success ? 'connected' : 'disconnected'}`;
        }
    }

    // Update button state
    updateButtonState(buttonId, state) {
        const button = document.getElementById(buttonId);
        if (!button) return;

        // Remove existing state classes
        button.classList.remove('active', 'inactive');
        
        // Add new state class
        if (state === 'active') {
            button.classList.add('active');
        } else if (state === 'inactive') {
            button.classList.add('inactive');
        }
    }

    // Update drag and drop state
    updateDragDropState(isDragging) {
        const uploadArea = document.getElementById('fileUploadArea');
        if (uploadArea) {
            if (isDragging) {
                uploadArea.classList.add('drag-over');
            } else {
                uploadArea.classList.remove('drag-over');
            }
        }
    }
}