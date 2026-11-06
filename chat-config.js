// In-game chat settings (Firebase). These values are NOT secret: Firebase web
// config is meant to be public, and access is controlled by firestore.rules.
// While this is null the chat button stays hidden and the game works as before.
window.CHAT_CONFIG = null;

// Example once set up:
// window.CHAT_CONFIG = {
//   adminUid: 'the User UID of your admin account (Firebase > Authentication > Users)',
//   firebase: {
//     apiKey: '...',
//     authDomain: '....firebaseapp.com',
//     projectId: '...',
//     storageBucket: '....appspot.com',
//     messagingSenderId: '...',
//     appId: '...',
//   },
// };
