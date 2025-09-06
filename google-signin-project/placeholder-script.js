// Check if user is signed in and display user info
window.onload = function() {
    const userInfo = sessionStorage.getItem('userInfo');
    
    if (!userInfo) {
        // User is not signed in, redirect to sign-in page
        window.location.href = 'index.html';
        return;
    }
    
    // Parse user information
    const user = JSON.parse(userInfo);
    
    // Display user information
    displayUserInfo(user);
};

function displayUserInfo(user) {
    const userInfoDiv = document.getElementById('user-info');
    
    userInfoDiv.innerHTML = `
        <img src="${user.picture}" alt="User Avatar" class="user-avatar" onerror="this.src='https://via.placeholder.com/60'">
        <div class="user-name">${user.name}</div>
        <div class="user-email">${user.email}</div>
    `;
    
    // Show the user info section
    userInfoDiv.style.display = 'block';
}

function signOut() {
    // Clear user session
    sessionStorage.removeItem('userInfo');
    
    // Show signing out message
    const button = document.querySelector('.sign-out-btn');
    button.textContent = 'Signing out...';
    button.disabled = true;
    
    // Redirect to sign-in page after a short delay
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 1000);
}