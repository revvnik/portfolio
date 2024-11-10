$(document).ready(function() {
    // Save references to elements
    var $sendEmailEl = $('#send-email');
    var $subjectEl = $('#subject');
    var $nameEl = $('#name');
    var $bodyEl = $('#message');

    function updateEmailLink() {
        var bodyContent = $bodyEl.val();
        var senderName = $nameEl.val();
        
        // Construct the email body with the sender's name at the end
        var fullBody = bodyContent + "\n\nSent by: " + senderName;

        // Update the mailto link
        $sendEmailEl.attr('href', 'mailto:nikitasitter@gmail.com?' +
            'subject=' + encodeURIComponent($subjectEl.val()) +
            '&body=' + encodeURIComponent(fullBody));
    }

    // Attach input event listener to update mailto link
    $('#subject, #message, #name').on('input', updateEmailLink);

    // Set up the email link initially and handle click to open the email client
    updateEmailLink();
    $sendEmailEl.on('click', function() {
        // Update link before sending email
        updateEmailLink();
        window.location.href = $sendEmailEl.attr('href');
    });
});