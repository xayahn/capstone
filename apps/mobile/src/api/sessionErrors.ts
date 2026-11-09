export class LocalSignOutError extends Error {
  constructor() {
    super('Private screens are closed, but this device could not erase the saved sign-in. Do not share this device until secure sign-out succeeds.');
    this.name = 'LocalSignOutError';
  }
}
