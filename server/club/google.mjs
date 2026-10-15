import { createRemoteJWKSet, createLocalJWKSet, jwtVerify } from 'jose';
import { ClubError } from './members.mjs';

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

function keySet(env) {
	// Integration tests sign their own ID tokens. Both settings are needed, so a stray key is inert.
	if (env.ALLOW_TEST_SIGN_IN === 'true' && env.TEST_GOOGLE_JWKS)
		return createLocalJWKSet(JSON.parse(env.TEST_GOOGLE_JWKS));
	return GOOGLE_JWKS;
}

/** Verify a Google Identity Services ID token for this app; returns the verified identity. */
export async function verifyGoogleCredential(credential, env) {
	if (!env.GOOGLE_CLIENT_ID)
		throw new ClubError('Sign-in is not set up yet.', 'CLUB_UNCONFIGURED', 503);
	if (typeof credential !== 'string' || credential.length > 4096)
		throw new ClubError('Google sign-in failed. Try again.', 'SIGN_IN_FAILED', 401);
	let payload;
	try {
		({ payload } = await jwtVerify(credential, keySet(env), {
			issuer: ISSUERS,
			audience: env.GOOGLE_CLIENT_ID,
			algorithms: ['RS256'],
			clockTolerance: 30
		}));
	} catch (error) {
		if (error?.code === 'ERR_JWKS_TIMEOUT' || error?.name === 'TypeError')
			throw new ClubError('Google is unreachable right now. Try again.', 'CLUB_UNAVAILABLE', 503);
		throw new ClubError('Google sign-in failed. Try again.', 'SIGN_IN_FAILED', 401);
	}
	if (
		typeof payload.sub !== 'string' ||
		typeof payload.email !== 'string' ||
		payload.email_verified !== true
	)
		throw new ClubError('This Google account has no verified email.', 'SIGN_IN_FAILED', 401);
	return {
		sub: payload.sub,
		email: payload.email,
		givenName: typeof payload.given_name === 'string' ? payload.given_name : ''
	};
}
