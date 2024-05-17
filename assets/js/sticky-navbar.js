const navbar = document.querySelector('.custom-navbar');

// Variable to store the previous scroll position
let prevScrollPos = window.pageYOffset;

// Function to handle scroll event
function handleScroll() {
    // Get the current scroll position
    const currentScrollPos = window.pageYOffset;

    // If the current scroll position is greater than the previous scroll position, show the navbar
    if (prevScrollPos < currentScrollPos) {
        navbar.style.transform = "translateY(0)";
    } else {
        // Otherwise, hide the navbar
        navbar.style.transform = "translateY(-100%)";
    }

    // Update the previous scroll position
    prevScrollPos = currentScrollPos;
}

// Listen for the scroll event
window.addEventListener('scroll', handleScroll);