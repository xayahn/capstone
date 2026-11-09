const apiBase = process.env.PARISHLINK_SMOKE_API ?? 'http://localhost:3000/api';
const browserOrigin = process.env.PARISHLINK_SMOKE_ORIGIN ?? 'http://localhost:8081';
const parsedBase = new URL(apiBase);
if (!['localhost', '127.0.0.1'].includes(parsedBase.hostname)) {
  throw new Error('The retained smoke journey is local-only. Use staging-specific tooling for remote systems.');
}

async function request(path, { method = 'GET', token, idempotencyKey, body } = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      Origin: browserOrigin,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    payload = { error: text };
  }
  return { status: response.status, payload };
}

function expect(condition, message) {
  if (!condition) throw new Error(`Local smoke check failed: ${message}`);
}

const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
const password = 'ParishLink!2026Secure';
const signup = await request('/mobile/auth/sign-up', {
  method: 'POST',
  body: {
    displayName: 'Synthetic Local Smoke',
    email: `local-smoke-${suffix}@example.test`,
    mobileNumber: '+63 917 000 0001',
    homeParishId: 'san-guillermo',
    password,
    confirmPassword: password,
    acceptPrivacyNotice: true,
  },
});
expect(signup.status === 201 && signup.payload?.accessToken, 'sign-up did not return a session');
const token = signup.payload.accessToken;

const catalog = await request('/mobile/catalog');
expect(catalog.status === 200, 'catalog was unavailable');
const parish = catalog.payload?.parishes?.find((item) => item.clergy?.length && item.venueId);
const service = catalog.payload?.services?.[0];
expect(parish && service, 'catalog did not contain a bookable resource');

let availableDate;
let availableTime;
for (let offset = 10; offset <= 30 && !availableTime; offset += 1) {
  const candidate = new Date(Date.now() + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const availability = await request('/mobile/availability', {
    method: 'POST', token,
    body: {
      serviceId: service.id,
      parishId: parish.id,
      clergyId: parish.clergy[0].id,
      venueId: parish.venueId,
      date: candidate,
    },
  });
  expect(availability.status === 200, 'availability search failed');
  const slot = availability.payload?.slots?.find((item) => item.available);
  if (slot) {
    availableDate = candidate;
    availableTime = slot.time;
  }
}
expect(availableDate && availableTime, 'no slot was available in the smoke window');

const appointmentKey = `appointment-${crypto.randomUUID()}`;
const appointmentInput = {
  serviceId: service.id,
  parishId: parish.id,
  clergyId: parish.clergy[0].id,
  venueId: parish.venueId,
  date: availableDate,
  time: availableTime,
  participants: [{ type: 'candidate', fullName: 'Synthetic Candidate', dateOfBirth: '2020-01-15' }],
  documents: [],
};
const appointmentOne = await request('/mobile/appointments', {
  method: 'POST', token, idempotencyKey: appointmentKey, body: appointmentInput,
});
const appointmentReplay = await request('/mobile/appointments', {
  method: 'POST', token, idempotencyKey: appointmentKey, body: appointmentInput,
});
expect(appointmentOne.status === 201, 'appointment creation failed');
expect(appointmentReplay.status === 201 && appointmentReplay.payload?.id === appointmentOne.payload?.id,
  'appointment retry did not return the original resource');
const appointmentMismatch = await request('/mobile/appointments', {
  method: 'POST', token, idempotencyKey: appointmentKey,
  body: { ...appointmentInput, participants: [{ type: 'candidate', fullName: 'Changed Candidate' }] },
});
expect(appointmentMismatch.status === 409, 'changed payload reused an appointment key');

const snapshot = await request('/mobile/snapshot', { token });
const savedAppointment = snapshot.payload?.appointments?.find((item) => item.id === appointmentOne.payload.id);
expect(savedAppointment?.participants?.[0]?.fullName === 'Synthetic Candidate', 'participant snapshot was not retained');

const queueKey = `queue-${crypto.randomUUID()}`;
const queueInput = { parishId: parish.id, service: 'General inquiry' };
const queueOne = await request('/mobile/queue/tickets', {
  method: 'POST', token, idempotencyKey: queueKey, body: queueInput,
});
const queueReplay = await request('/mobile/queue/tickets', {
  method: 'POST', token, idempotencyKey: queueKey, body: queueInput,
});
expect(queueOne.status === 201, 'queue creation failed');
expect(queueReplay.status === 201 && queueReplay.payload?.id === queueOne.payload?.id,
  'queue retry did not return the original resource');
const leaveOne = await request('/mobile/queue/tickets/active', { method: 'DELETE', token });
const leaveReplay = await request('/mobile/queue/tickets/active', { method: 'DELETE', token });
expect(leaveOne.status === 204 && leaveReplay.status === 204, 'queue leave was not idempotent');
let assistantVerification;
if (process.env.PARISHLINK_SMOKE_GEMINI === 'true') {
  // Explicit opt-in only: one public provider question. No fixture profile,
  // appointment or queue details are sent to the model by this path.
  const publicAnswer = await request('/mobile/assistant', {
    method: 'POST', token,
    body: { prompt: 'How does document verification work?', allowExternalAI: true },
  });
  const privateAnswer = await request('/mobile/assistant', {
    method: 'POST', token,
    body: { prompt: 'What is my latest request status?', allowExternalAI: true },
  });
  assistantVerification = {
    publicReplyFromGemini: publicAnswer.status === 200 && publicAnswer.payload?.provider === 'gemini',
    privateReplyStayedLocal: privateAnswer.status === 200 && privateAnswer.payload?.provider === 'parishlink',
  };
}
const signout = await request('/mobile/auth/sign-out', { method: 'POST', token });
expect(signout.status === 204, 'sign-out failed');

process.stdout.write(`${JSON.stringify({
  signUp: signup.status,
  appointmentCreate: appointmentOne.status,
  appointmentReplaySameResource: true,
  changedPayloadRejected: appointmentMismatch.status,
  participantCaptured: true,
  queueCreate: queueOne.status,
  queueReplaySameResource: true,
  repeatedQueueLeave: leaveReplay.status,
  signOut: signout.status,
  ...(assistantVerification ? { assistantVerification } : {}),
}, null, 2)}\n`);
if (assistantVerification) {
  expect(assistantVerification.publicReplyFromGemini, 'the public question did not return a live Gemini reply');
  expect(assistantVerification.privateReplyStayedLocal, 'the private question did not remain on the local path');
}
process.stdout.write('ParishLink local synthetic smoke journey passed. No deployment was performed.\n');
