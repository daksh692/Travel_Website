var hoverLabel = document.getElementById('hover-label');

// Add event listener to the document to track mouse movement
document.addEventListener('mousemove', function(event) {
    // Update the position of the hover label based on the mouse position
    hoverLabel.style.left = (event.clientX + 10) + 'px'; // Add 10px offset for better visibility
    hoverLabel.style.top = (event.clientY + 10) + 'px'; // Add 10px offset for better visibility
});

// Add event listener to show the hover label when hovering over a state path
document.querySelectorAll('.state').forEach(function(element) {
    element.addEventListener('mouseover', function(event) {
        hoverLabel.innerText = event.target.id.replaceAll('_', ' ').replace(/(^\w|\s\w)/g, m => m.toUpperCase()); // Convert underscores to spaces and capitalize state name
        hoverLabel.style.display = 'block';
    });
    element.addEventListener('mouseout', function() {
        hoverLabel.style.display = 'none';
    });
});

// Event listener for clicking on SVG buttons
document.querySelectorAll('.state').forEach(function(element) {
    element.addEventListener('click', function(event) {
        var stateName = event.target.id.replaceAll('_', ' ').replace(/(^\w|\s\w)/g, m => m.toUpperCase()); // Get the state name
        window.location.href = 'listofplace.php?state=' + encodeURIComponent(stateName); // Redirect to listofplace.php with state name as parameter
    });
});
