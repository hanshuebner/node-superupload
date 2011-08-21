
$(document).ready(function () {

    // Provide in-textarea prompt - Whatever is in the textarea in the
    // HTML document is the prompt, displayed with the
    // "no-text-rendered" class.  When the textarea gets the focus,
    // the prompt and the "no-text-rendered" class are removed, when
    // the focus is lost, the prompt and class are put back.

    $('textarea')
        .each(function () {
            this.promptString = $(this).val();
        })
        .bind('focus', function () {
            if ($(this).val() == this.promptString) {
                $(this)
                    .val('')
                    .removeClass('no-text-entered');
            }
        })
        .bind('blur', function () {
            if ($(this).val() == '') {
                $(this)
                    .val(this.promptString)
                    .addClass('no-text-entered');
            }
        });

    // Check the status of the upload, update the progress display and
    // finish up when the upload is done.

    function updateStatus(data) {

        if (data.progress < 1) {
            // upload not yet finished

            $('#percent').html(Math.floor(data.progress * 100));
            $.getJSON('/status', updateStatus);

        } else {
            // upload finished

            $('#upload-progress').addClass('hidden');
            $('#uploaded-file').html(data.upload.name);
            $('#upload-done').removeClass('hidden');

            // Check that something has been entered in the
            // "description" text area before allowing the user to
            // click "save"

            setInterval(function () {
                if (($('textarea').val() == $('textarea')[0].promptString)
                    || ($('textarea').val() == '')) {
                    $('#save-button').attr('disabled', 'disabled');
                } else {
                    $('#save-button').removeAttr('disabled');
                }
            }, 300);
        }
    }

    // Check whether the user has selected a file and start uploading
    // if so.
    var fileSelectionPoll = setInterval(function () {
        if ($('input[type="file"]').val()) {
            clearInterval(fileSelectionPoll);
            $('#file-selector').addClass('hidden');
            $('#upload-progress').removeClass('hidden');

            // Before actually submitting the form, invoke the /status
            // handler once to make sure that we have a session.
            // Sessions are opened only for dynamic handlers, not
            // static files.

            $.getJSON('/status', function () {
                $('#upload-form').submit();
                $.getJSON('/status', updateStatus);
            });
        }
    }, 300);
});
