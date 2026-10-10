/* global mailupAjax, grecaptcha */
( function ( $ ) {
	'use strict';

	var REQUIRED_FIELDS = [
		{ name: 'campo1', errorKey: 'error_first_name' },
		{ name: 'campo2', errorKey: 'error_last_name' },
		{ name: 'campo3', errorKey: 'error_company' },
	];

	function initMailupForm( $form ) {
		var strings = {};
		try {
			strings = JSON.parse( $form.attr( 'data-strings' ) || '{}' );
		} catch ( e ) {}

		var nonce            = $form.attr( 'data-nonce' );
		var list             = $form.attr( 'data-list' );
		var apgroup          = $form.attr( 'data-apgroup' );
		var recaptchaSiteKey = $form.attr( 'data-recaptcha-site-key' ) || '';
		var skipCaptchaToken = $form.attr( 'data-skip-captcha-token' ) || '';
		var ajaxUrl          = ( typeof mailupAjax !== 'undefined' ) ? mailupAjax.url : '';

		// ── Helpers ──────────────────────────────────────────────────────────

		function $errorOf( $input ) {
			return $input.closest( '.mailup-field-wrap' ).find( '.mailup-error' );
		}

		function setError( $input, message ) {
			$input.addClass( 'is-invalid' ).attr( 'aria-invalid', 'true' );
			$errorOf( $input ).text( message );
		}

		function clearError( $input ) {
			$input.removeClass( 'is-invalid' ).removeAttr( 'aria-invalid' );
			$errorOf( $input ).text( '' );
		}

		function clearAllErrors() {
			$form.find( '.form-field, [name="privacy"]' ).each( function () {
				clearError( $( this ) );
			} );
		}

		function isValidEmail( val ) {
			return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test( val );
		}

		function validateRequired( $input, errorKey ) {
			if ( ! $input.val().trim() ) {
				setError( $input, strings[ errorKey ] || '' );
				return false;
			}
			return true;
		}

		// ── Validation ───────────────────────────────────────────────────────

		function validate() {
			var valid    = true;
			var $email   = $form.find( '[name="email"]' );
			var $privacy = $form.find( '[name="privacy"]' );

			clearAllErrors();

			REQUIRED_FIELDS.forEach( function ( field ) {
				var $input = $form.find( '[name="' + field.name + '"]' );
				if ( ! validateRequired( $input, field.errorKey ) ) {
					valid = false;
				}
			} );

			if ( ! $email.val().trim() || ! isValidEmail( $email.val().trim() ) ) {
				setError( $email, strings.error_email );
				valid = false;
			}

			if ( ! $privacy.is( ':checked' ) ) {
				setError( $privacy, strings.error_privacy );
				valid = false;
			}

			return valid;
		}

		// ── Live validation on blur / change ─────────────────────────────────

		REQUIRED_FIELDS.forEach( function ( field ) {
			$form.find( '[name="' + field.name + '"]' ).on( 'blur', function () {
				var $el = $( this );
				clearError( $el );
				validateRequired( $el, field.errorKey );
			} );
		} );

		$form.find( '[name="email"]' ).on( 'blur', function () {
			var $el = $( this );
			var val = $el.val().trim();
			clearError( $el );
			if ( ! val || ! isValidEmail( val ) ) {
				setError( $el, strings.error_email );
			}
		} );

		$form.find( '[name="privacy"]' ).on( 'change', function () {
			var $el = $( this );
			clearError( $el );
			if ( ! $el.is( ':checked' ) ) {
				setError( $el, strings.error_privacy );
			}
		} );

		// ── AJAX submit ───────────────────────────────────────────────────────

		function doSubmit( recaptchaToken ) {
			var $btn     = $form.find( '[type="submit"]' );
			var $message = $form.find( '.mailup-form-message' );

			var postData = {
				action:             'mailup_subscribe',
				nonce:              nonce,
				campo1:             $form.find( '[name="campo1"]' ).val().trim(),
				campo2:             $form.find( '[name="campo2"]' ).val().trim(),
				campo7:             $form.find( '[name="campo7"]' ).val().trim(),
				campo3:             $form.find( '[name="campo3"]' ).val().trim(),
				email:              $form.find( '[name="email"]' ).val().trim(),
				privacy:            $form.find( '[name="privacy"]' ).is( ':checked' ) ? 'on' : '',
				recaptcha:          recaptchaToken || '',
				skip_captcha_token: skipCaptchaToken,
				list:               list,
				apgroup:            apgroup,
			};

			if ( $form.find( '[name="campo28"]' ).is( ':checked' ) ) {
				postData.campo28 = '';
			}

			$.post( ajaxUrl, postData )
			.done( function ( res ) {
				if ( res.success ) {
					$form.find( '.mailup-field-wrap' ).hide();
					$message
						.addClass( 'is-success' )
						.text( ( res.data && res.data.message ) ? res.data.message : strings.success )
						.show();
				} else {
					if ( res.data && res.data.fields ) {
						$.each( res.data.fields, function ( fieldName, msg ) {
							var $input = $form.find( '[name="' + fieldName + '"]' );
							if ( $input.length ) {
								setError( $input, msg );
							}
						} );
					}

					var errMsg = ( res.data && res.data.message ) ? res.data.message : strings.error_generic;
					$message.addClass( 'is-error' ).text( errMsg ).show();

					$btn.prop( 'disabled', false ).text( strings.submit_default || 'Subscribe' );
				}
			} )
			.fail( function () {
				$form.find( '.mailup-form-message' )
					.addClass( 'is-error' )
					.text( strings.error_generic || 'An error occurred. Please try again later.' )
					.show();

				$btn.prop( 'disabled', false ).text( strings.submit_default || 'Subscribe' );
			} );
		}

		// ── Submit handler ────────────────────────────────────────────────────

		$form.on( 'submit', function ( e ) {
			e.preventDefault();

			if ( ! validate() ) {
				var $first = $form.find( '.mailup-error' ).filter( function () {
					return $( this ).text().length > 0;
				} ).first();
				if ( $first.length ) {
					$( 'html, body' ).animate( { scrollTop: $first.offset().top - 80 }, 300 );
				}
				return;
			}

			var $btn     = $form.find( '[type="submit"]' );
			var $message = $form.find( '.mailup-form-message' );

			$btn.prop( 'disabled', true ).text( strings.sending || 'Sending…' );
			$message.hide().removeClass( 'is-success is-error' ).text( '' );

			// reCAPTCHA v3: execute silently, then submit
			if ( recaptchaSiteKey && ! skipCaptchaToken && typeof grecaptcha !== 'undefined' ) {
				grecaptcha.ready( function () {
					grecaptcha.execute( recaptchaSiteKey, { action: 'mailup_subscribe' } )
						.then( function ( token ) {
							doSubmit( token );
						} )
						.catch( function () {
							doSubmit( '' );
						} );
				} );
			} else {
				doSubmit( '' );
			}
		} );
	}

	$( function () {
		$( '.mailup-form' ).each( function () {
			initMailupForm( $( this ) );
		} );
	} );

} )( jQuery );
