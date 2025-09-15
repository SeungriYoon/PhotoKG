# Contributing to PhotoRAG Knowledge Graph System

Thank you for your interest in contributing to PhotoRAG! This document provides guidelines and information for contributors.

## 🤝 How to Contribute

### Reporting Issues
- Use the GitHub issue tracker to report bugs
- Include detailed steps to reproduce the issue
- Provide system information (OS, Node.js version, etc.)
- Include error messages and logs when possible

### Suggesting Features
- Open a new issue with the "enhancement" label
- Describe the feature and its use case
- Consider the impact on existing functionality

### Code Contributions
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests if applicable
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## 🛠️ Development Setup

### Prerequisites
- Node.js (v16.0.0+)
- Python (v3.8+)
- Git
- ArangoDB (for full functionality)

### Local Development
```bash
# Clone your fork
git clone https://github.com/your-username/PhotoRAG.git
cd PhotoRAG

# Install dependencies
cd backend && npm install && cd ..
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Start development servers
cd backend && npm run dev &
cd .. && python -m http.server 3000
```

## 📝 Coding Standards

### JavaScript/Node.js
- Use ES6+ features
- Follow async/await patterns
- Use meaningful variable names
- Add JSDoc comments for functions
- Use 2 spaces for indentation

### Python
- Follow PEP 8 style guide
- Use type hints where appropriate
- Add docstrings for functions and classes
- Use 4 spaces for indentation

### General
- Write clear, self-documenting code
- Add comments for complex logic
- Keep functions small and focused
- Use consistent naming conventions

## 🧪 Testing

### Backend Testing
```bash
cd backend
npm test
```

### Frontend Testing
- Test in multiple browsers
- Verify responsive design
- Check accessibility features

### Integration Testing
- Test file upload functionality
- Verify AI integration
- Check database operations

## 📚 Documentation

### Code Documentation
- Add JSDoc comments for JavaScript functions
- Include docstrings for Python functions
- Update README.md for new features
- Document API changes

### User Documentation
- Update installation guides
- Add usage examples
- Document configuration options

## 🎯 Areas for Contribution

### High Priority
- Performance optimizations
- Additional AI model integrations
- Enhanced visualization features
- Better error handling

### Medium Priority
- Additional file format support
- Export functionality improvements
- UI/UX enhancements
- Documentation improvements

### Low Priority
- Additional analysis algorithms
- Custom visualization themes
- Plugin system
- Advanced filtering options

## 🔍 Code Review Process

### For Contributors
- Ensure all tests pass
- Update documentation as needed
- Respond to review feedback promptly
- Keep commits focused and atomic

### For Reviewers
- Review code for correctness and style
- Check for security issues
- Verify documentation updates
- Test the changes locally

## 🐛 Bug Reports

When reporting bugs, please include:

1. **Environment Information**
   - Operating System
   - Node.js version
   - Python version
   - Browser (for frontend issues)

2. **Steps to Reproduce**
   - Detailed steps to reproduce the issue
   - Expected behavior
   - Actual behavior

3. **Additional Information**
   - Error messages
   - Screenshots (if applicable)
   - Log files
   - Sample data (if relevant)

## 💡 Feature Requests

When suggesting features:

1. **Problem Description**
   - What problem does this solve?
   - Who would benefit from this feature?

2. **Proposed Solution**
   - How should this work?
   - Any implementation ideas?

3. **Alternatives Considered**
   - What other approaches were considered?
   - Why is this approach better?

## 📋 Pull Request Template

When creating a pull request, please include:

- [ ] Description of changes
- [ ] Related issue number
- [ ] Screenshots (if UI changes)
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] Breaking changes noted

## 🏷️ Labels

We use the following labels for issues and PRs:

- `bug` - Something isn't working
- `enhancement` - New feature or request
- `documentation` - Improvements to documentation
- `good first issue` - Good for newcomers
- `help wanted` - Extra attention is needed
- `question` - Further information is requested
- `wontfix` - This will not be worked on

## 📞 Getting Help

If you need help:

1. Check existing issues and discussions
2. Read the documentation
3. Ask questions in the discussions section
4. Join our community chat (if available)

## 🎉 Recognition

Contributors will be recognized in:
- CONTRIBUTORS.md file
- Release notes
- Project documentation

Thank you for contributing to PhotoRAG! 🚀
