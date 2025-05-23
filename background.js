
const encodedKey = "c2stb3ItdjEtY2JhZDUwYWY2ZTMxNTQyYTM5ZWQ0YjhkODI1NTJlMzNmNWZjNjMzNWJjYjExNzE0ZWEwMDlmODQ0Yzk0YWFlMw=="; 


function decodeBase64(encoded) {
  return atob(encoded);
}

chrome.runtime.onInstalled.addListener(() => {
  const decodedKey = decodeBase64(encodedKey);

  chrome.storage.local.set({
    apiKey: decodedKey
  }, () => {
    console.log('RePhrase AI: API key successfully initialized.');
  });
});
