const routes = [
  '/',
  '/community',
  '/chat',
  '/profile',
  '/register',
  '/material/1'
];

const BASE_URL = 'http://localhost:4000';

async function verifyRoutes() {
  console.log('Starting Route Verification...');
  let hasError = false;

  for (const route of routes) {
    try {
      const response = await fetch(`${BASE_URL}${route}`);
      if (response.status === 200) {
        console.log(`✅ [PASS] ${route} - Status 200`);
      } else {
        console.error(`❌ [FAIL] ${route} - Status ${response.status}`);
        hasError = true;
      }
    } catch (error) {
      console.error(`❌ [FAIL] ${route} - Network Error: ${error.message}`);
      hasError = true;
    }
  }

  if (hasError) {
    console.error('\nRoute verification failed!');
    process.exit(1);
  } else {
    console.log('\nAll routes verified successfully!');
  }
}

verifyRoutes();
