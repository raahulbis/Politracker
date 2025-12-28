# Security Policy

## Supported Versions

We actively support security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in PoliTracker, please report it responsibly:

1. **Do NOT** open a public issue
2. Email the maintainers directly or use GitHub's private security reporting feature
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will acknowledge receipt within 48 hours and provide an update on the status of the vulnerability within 7 days.

## Security Best Practices

### For Users

- Keep your dependencies up to date (`npm update`)
- Do not commit sensitive data (API keys, passwords) to the repository
- Use environment variables for configuration
- Review and understand any scripts you run

### For Contributors

- Never commit API keys, secrets, or credentials
- Use environment variables for sensitive configuration
- Follow secure coding practices
- Review pull requests for security issues
- Keep dependencies updated

## Known Security Considerations

### SSL Certificate Verification

The codebase includes SSL certificate verification settings that can be configured via environment variables. In production, SSL verification should always be enabled for security.

To disable SSL verification (development only):
```bash
export SSL_REJECT_UNAUTHORIZED=false
```

**Warning**: Only use this in development environments. Never disable SSL verification in production.

## Data Privacy

PoliTracker:
- Does not collect or store personal user data
- Uses publicly available government data
- Does not track users or store analytics
- All data processing happens locally

## Dependencies

We regularly update dependencies to address security vulnerabilities. If you find a security issue in a dependency, please report it following the process above.

## Security Updates

Security updates will be:
- Released as patch versions (e.g., 0.1.0 → 0.1.1)
- Documented in release notes
- Prioritized over feature development

Thank you for helping keep PoliTracker secure!


