// Handle Google Sign-In response
function handleCredentialResponse(response) {
    console.log("Encoded JWT ID token: " + response.credential);
    
    // Decode the JWT token to get user information
    const responsePayload = decodeJwtResponse(response.credential);
    
    console.log("ID: " + responsePayload.sub);
    console.log('Full Name: ' + responsePayload.name);
    console.log('Given Name: ' + responsePayload.given_name);
    console.log('Family Name: ' + responsePayload.family_name);
    console.log("Image URL: " + responsePayload.picture);
    console.log("Email: " + responsePayload.email);
    
    // Store user info in sessionStorage for the placeholder page
    sessionStorage.setItem('userInfo', JSON.stringify({
        name: responsePayload.name,
        email: responsePayload.email,
        picture: responsePayload.picture
    }));
    
    // Redirect to department selection page
    window.location.href = 'department-selection.html';
}

// Decode JWT token
function decodeJwtResponse(token) {
    var base64Url = token.split('.')[1];
    var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    var jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
}

// Manual sign-in function for demo purposes
function signInManually() {
    // Simulate a successful sign-in for demo
    const demoUser = {
        name: "Demo User",
        email: "demo@example.com",
        picture: "https://via.placeholder.com/150"
    };
    
    // Store demo user info
    sessionStorage.setItem('userInfo', JSON.stringify(demoUser));
    
    // Show a brief loading message
    const button = document.getElementById('manual-signin-btn');
    const originalText = button.textContent;
    button.textContent = 'Signing in...';
    button.disabled = true;
    
    // Redirect after a short delay
    setTimeout(() => {
        window.location.href = 'department-selection.html';
    }, 1000);
}

// Initialize Google Sign-In when the page loads
window.onload = function() {
    // Check if user is already signed in
    const userInfo = sessionStorage.getItem('userInfo');
    if (userInfo) {
        // User is already signed in, redirect to department selection
        window.location.href = 'department-selection.html';
    }
};