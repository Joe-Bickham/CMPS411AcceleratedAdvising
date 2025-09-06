# Google Sign-In Project

A simple web application with Google OAuth authentication that redirects users to a placeholder page after successful sign-in.

## Features

- Google Sign-In integration
- Responsive design
- Session management
- Automatic redirection after authentication
- Demo mode for testing without Google OAuth setup

## Files Structure

```
google-signin-project/
├── index.html              # Main sign-in page
├── styles.css              # Styles for sign-in page
├── script.js               # JavaScript for sign-in functionality
├── placeholder.html        # Placeholder page after sign-in
├── placeholder-styles.css  # Styles for placeholder page
├── placeholder-script.js   # JavaScript for placeholder page
└── README.md              # This file
```

## Quick Start (Demo Mode)

1. Open `index.html` in your web browser
2. Click the "Sign In with Google" button (blue button)
3. You'll be redirected to the placeholder page with demo user info

## Setting Up Real Google OAuth (Optional)

To use actual Google Sign-In:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API
4. Create OAuth 2.0 credentials:
   - Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client IDs"
   - Set application type to "Web application"
   - Add your domain to authorized origins (e.g., `http://localhost:3000`)
5. Copy your Client ID
6. Replace `YOUR_GOOGLE_CLIENT_ID` in `index.html` with your actual Client ID

## Usage

1. **Sign In**: Users can sign in using the Google Sign-In button or the demo button
2. **Placeholder Page**: After successful authentication, users are redirected to a placeholder page
3. **Sign Out**: Users can sign out from the placeholder page to return to the sign-in page

## Browser Compatibility

- Chrome (recommended)
- Firefox
- Safari
- Edge

## Notes

- The demo mode uses session storage to simulate authentication
- For production use, implement proper server-side authentication
- The placeholder page is intentionally minimal as requested