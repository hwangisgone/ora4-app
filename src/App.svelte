<script type="text/javascript">
	// TODO(developer): Set to client ID and API key from the Developer Console
	const CLIENT_ID = '<YOUR_CLIENT_ID>';
	const API_KEY = '<YOUR_API_KEY>';
	// IMPORTANT READ THIS: https://developers.google.com/gmail/api/quickstart/js


	// Discovery doc URL for APIs used by the quickstart
	const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest';

	// Authorization scopes required by the API; multiple scopes can be
	// included, separated by spaces.
	const SCOPES = 'https://www.googleapis.com/auth/gmail.modify';

	let tokenClient;
	let gapiInited = false;
	let gisInited = false;

	let signedIn = false;
	const cookieName = 'token_saved_YOUR_MSSV_HERE';

	/**
	 * Callback after api.js is loaded.
	 */
	function gapiLoaded() {
		gapi.load('client', initializeGapiClient);
	}

	/**
	 * Callback after the API client is loaded. Loads the
	 * discovery doc to initialize the API.
	 */
	async function initializeGapiClient() {
		await gapi.client.init({
			apiKey: API_KEY,
			discoveryDocs: [DISCOVERY_DOC],
		});
		gapiInited = true;
		initGmail();
	}

	/**
	 * Callback after Google Identity Services are loaded.
	 */
	function gisLoaded() {
		tokenClient = google.accounts.oauth2.initTokenClient({
			client_id: CLIENT_ID,
			scope: SCOPES,
			callback: handleToken,
		});
		gisInited = true;
		initGmail();
	}

	async function handleToken(res) {
		if (res.error !== undefined) {
			console.log(res);
			throw (res);
		}

		const newToken = {
				access_token: res.access_token,
				expires_in: res.expires_in,
				scope: res.scope,
				token_type: res.token_type,
				id_token: res.id_token
		};

		localStorage.setItem(cookieName, JSON.stringify(newToken));

		gapi.client.setToken(newToken);
		signedIn = true;
		emailList = [];
	}

	function initGmail() {
		if (gapiInited && gisInited) {
			const tokenSaved = localStorage.getItem(cookieName);
			if (tokenSaved) {
				const parsedToken = JSON.parse(tokenSaved);
				gapi.client.setToken(parsedToken);
				checkTokenValidity();
			}
		}    
	}

	async function checkTokenValidity() {
		try {
				await gapi.client.gmail.users.labels.list({ 'userId': 'me' });
				signedIn = true;
				emailList = [];
		} catch (err) {
				if (err.status === 401) {  // Token hết hạn
					tokenClient.requestAccessToken({prompt: ''});
				} else {
					console.error('Error checking token validity:', err);
					localStorage.removeItem(cookieName);
				}
		}
	}


	/**
	 *  Sign in the user upon button click.
	 */
	function handleAuthen() {
		tokenClient.requestAccessToken({prompt: 'consent'});
	}

	function handleSignout() {
		const token = gapi.client.getToken();
		if (token !== null) {
			google.accounts.oauth2.revoke(token.access_token);
			gapi.client.setToken('');
			signedIn = false;
		}
	}

	let htmlEnabled = false;
	let errMessage = "Press refresh to get emails";  
	let emailList = [];
	let refreshDisabled = false;

	async function refreshEmailList() {  // get email list
		emailList = [];
		refreshDisabled = true;
		let response;
		try {
				response = await gapi.client.gmail.users.messages.list({
						'userId': 'me',
						'labelIds': 'INBOX',
						'maxResults': 10
				});
		} catch (err) {
			errMessage = err.result.error.message;
			console.error(err);
			return;
		}

		errMessage = "";
		const metaemails = response.result.messages;
		if (!metaemails || metaemails.length == 0) {
				errMessage = 'No email found.';
				return;
		}

		for (const metaemail of metaemails) {
			const email = await getMessage(metaemail.id);
			email.subject = email.payload.headers.find(h => h.name === "Subject").value;
			email.fromFull = email.payload.headers.find(h => h.name === "From").value;
			email.from = email.fromFull.split(" <")[0];
			email.receiveDate = new Date(Number(email.internalDate))

			const parts = email.payload.parts;
			if (!parts || parts.length === 0) {
				email.body = '';
			} else {
				email.htmlbody = parseHtmlBody(parts);
				email.body = parsePlainTextBody(parts);

				if (email.htmlbody == '') { email.htmlbody = email.body; }
			}
			// console.log(metaemail.id);
			email.expanded = false;
			emailList.push(email);
			emailList = emailList;
		}
		refreshDisabled = false;
	}

	async function getMessage(msgId) {
		try {
			const msgResponse = await gapi.client.gmail.users.messages.get({
					'userId': 'me',
					'id': msgId,
					'format': 'full' // Lấy thông tin đầy đủ của email
			});
			return msgResponse.result;
		} catch (err) {
				console.error('Error fetching email details:', err);
		}
	}

	// Sending emails
	let composeMode = false;
	let composeTo = "";
	let composeSubject = "";
	let composeContent = "";
	let attachedFileList;

async function sendEmail() {
	const file = attachedFileList[0];

	const boundary = `----${Math.random().toString(36).substring(2)}`;

	let email = `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
	email += `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${composeContent}\r\n`;
	if (file) {
			const base64File = await getBase64(file);
			email += `--${boundary}\r\nContent-Type: ${file.type}; name="${encodeURIComponent(file.name)}"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename="${encodeURIComponent(file.name)}"\r\n\r\n${base64File}\r\n`;
	}
	email += `--${boundary}--`;

	const rawEmail = [
			`To: ${composeTo}`,
			`Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(composeSubject)))}?=`,
			'MIME-Version: 1.0',
			email
	].join('\r\n');

	const base64EncodedEmail = btoa(unescape(encodeURIComponent(rawEmail))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	await sendMessage(base64EncodedEmail);
}

	function getBase64(file) {
		return new Promise((resolve, reject) => {
				const reader = new FileReader();
				reader.readAsDataURL(file);
				reader.onload = () => resolve(reader.result.split(',')[1]);
				reader.onerror = error => reject(error);
		});
	}

	async function sendMessage(base64EncodedEmail) {
		try {
			await gapi.client.gmail.users.messages.send({
					'userId': 'me',
					'resource': {
							'raw': base64EncodedEmail
					}
			});
			alert('Email sent!');
		} catch (err) {
			console.error(err);
			alert('Failed to send email: ' + err.message);
		}
	}




	function parseHtmlBody(parts) {
		const htmlParts = parts.find(part => part.mimeType === 'text/html');
		if (htmlParts) {
			if (htmlParts.body) {
				return atob(htmlParts.body.data.replace(/-/g, '+').replace(/_/g, '/'));        
			}
		}

		return '';
	}

	function parsePlainTextBody(parts) {
		const plainTextPart = parts.find(part => part.mimeType === 'text/plain');
		if (plainTextPart) {
			const body = plainTextPart.body;
			if (body && body.size > 0) {
					const data = body.data;
					const decodedData = decodeURIComponent(escape(atob(data.replace(/-/g, '+').replace(/_/g, '/'))));
					return decodedData.replace(/<[^>]*>?/gm, '');
			}
		}
		return '';
	}

</script>

<svelte:head>
	<script async defer src="https://apis.google.com/js/api.js" on:load={gapiLoaded}></script>
	<script async defer src="https://accounts.google.com/gsi/client" on:load={gisLoaded}></script>
</svelte:head>

<main>


	<div class="container-fluid">
		<div class="m-5 gap-3 d-flex flex-column">
			<h1>EMAIL EMAIL EMAIL EMAIL EMAIL EMAIL EMAIL EMAIL EMAIL EMAIL !@#$%?</h1>

			<div class="d-flex pb-4 gap-3 border-bottom border-3 border-black ">
				{#if composeMode}
					<button class="btn btn-info btn-lg" on:click={() => composeMode = false}>View emails</button>
				{:else}
					<button class="btn btn-info btn-lg" on:click={() => composeMode = true}>Send email</button>
				{/if}

				{#if signedIn}
					<button class="btn btn-secondary btn-lg" on:click={handleSignout}>Logout</button>
				{:else}
					<button class="btn btn-primary btn-lg" on:click={handleAuthen}>Login with google</button>
				{/if}
			</div>

{#if signedIn}

			{#if composeMode}
				<h3>Compose an email</h3>
				<!-- Write emails -->
				<form class="d-flex flex-column gap-3"on:submit|preventDefault={sendEmail}>
					<div>
						<h5>Send to:</h5>
						<input required type="email" class="form-control" bind:value={composeTo} placeholder="name@example.com">
					</div>
					<div>
						<h5>Subject:</h5>
						<input required type="text" class="form-control" bind:value={composeSubject} placeholder="Title">
					</div>
					<div>
						<h5>Body:</h5>
						<textarea required class="form-control" bind:value={composeContent} rows="4"></textarea>
					</div>
					<div>
						<h5>File attachment:</h5>
						<input class="form-control" bind:files={attachedFileList} type="file">
					</div>
					<button class="btn btn-primary" type="submit">Send email</button>          
				</form>
			{:else}
				<!-- View emails -->
				<div class="d-flex align-items-center gap-3">
					<button class="btn btn-primary" on:click={refreshEmailList} disabled={refreshDisabled}>Refresh email list</button>
					<div class="form-check form-switch " title="Note: some emails may not display correctly if this is enabled.">
						<input class="form-check-input" type="checkbox" id="flexCheckDefault" bind:checked={htmlEnabled}>
						<label class="form-check-label" for="flexCheckDefault">
							View emails in HTML Mode{#if htmlEnabled}. Note: some emails may not display correctly if this is enabled.{/if}
						</label>
					</div>
				</div>

				{#if errMessage == ""}
					{#each emailList as email, i}
						<div class="border border-primary rounded">
								<button class="container-fluid btn btn-outline-primary text-body text-start" on:click={() => email.expanded = !email.expanded}>
									<div class="row">
										<span class="col">{email.from}</span>
										<span class="col-6">{email.subject}</span>
										<span class="col text-end">{email.receiveDate.toLocaleDateString()}</span>
									</div>
									
								</button>
								{#if email.expanded}
									<div class="p-2">
										<div class="mb-4 d-flex justify-content-between">
											<span>From: {email.fromFull}</span>
											<span>{email.receiveDate}</span>
										</div>
										{#if htmlEnabled}
											<div>{@html email.htmlbody}</div>
										{:else}
											<div>{email.body}</div>
										{/if}
									</div>

								{/if}
						</div>
					{/each}
				{:else}
					<div>{errMessage}</div>
				{/if}

			{/if}
{:else}
	<h5>Please log in with google first</h5>
	<!-- <p>If you encounter "Google hasn’t verified this app" error, click "Advanced".</p> -->
{/if}

		</div>
	</div>


</main>

