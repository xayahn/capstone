// Expo's native transport implements manual redirects on both iOS and Android.
// Do not fall back to React Native's legacy XMLHttpRequest-backed fetch here.
export { fetch as apiFetch } from 'expo/fetch';
