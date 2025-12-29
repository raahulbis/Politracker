# Contributing to PoliTracker

Thank you for your interest in contributing to PoliTracker! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for all contributors.

## How to Contribute

### Reporting Bugs

If you find a bug, please open an issue with:
- A clear, descriptive title
- Steps to reproduce the issue
- Expected vs. actual behavior
- Your environment (OS, Node.js version, etc.)
- Any relevant error messages or logs

### Suggesting Features

Feature suggestions are welcome! Please open an issue with:
- A clear description of the feature
- Use cases and examples
- Any potential implementation considerations

### Pull Requests

1. **Fork the repository** and create a new branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the coding standards below

3. **Test your changes**:
   ```bash
   npm run lint
   npm run build
   ```

4. **Commit your changes** with clear, descriptive commit messages:
   ```bash
   git commit -m "Add feature: description of what you added"
   ```

5. **Push to your fork** and open a Pull Request:
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Wait for review** - maintainers will review your PR and provide feedback

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/politracker.git
   cd politracker
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up the database:
   ```bash
   npm run db:setup
   npm run db:fetch-mps
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Follow existing code style and patterns
- Add type definitions for new interfaces/types
- Avoid `any` types when possible

### Code Style

- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions focused and single-purpose
- Follow the existing code formatting (we use ESLint with Next.js defaults)

### Testing

- Test your changes locally before submitting
- Ensure the build completes successfully (`npm run build`)
- Verify linting passes (`npm run lint`)

## Project Structure

- `/app` - Next.js app router pages and API routes
- `/components` - React components
- `/lib` - Utility functions and API clients
- `/scripts` - Data import and setup scripts
- `/types` - TypeScript type definitions
- `/data` - Database and data files (gitignored)

## Database Changes

If you're making changes to the database schema:

1. Update the schema in `scripts/setup-database.ts`
2. Document the changes in `README_DATABASE.md`
3. Consider migration scripts for existing databases

## API Integration

When working with external APIs:

- Respect rate limits and implement retry logic
- Handle errors gracefully
- Cache data when appropriate
- Document any API key requirements

## Documentation

- Update README.md if you add new features or change setup steps
- Add JSDoc comments for new functions
- Update relevant documentation files

## Questions?

If you have questions about contributing, feel free to:
- Open an issue with the `question` label
- Check existing issues and discussions

Thank you for contributing to PoliTracker! 🎉



