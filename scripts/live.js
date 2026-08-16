import { execSync } from 'child_process';

function run(command) {
  console.log(`\x1b[36m> ${command}\x1b[0m`);
  try {
    execSync(command, { stdio: 'inherit' });
  } catch (error) {
    console.error(`\x1b[31m❌ Command failed: ${command}\x1b[0m`);
    throw error;
  }
}

console.log('\n🚀 Deploying main → production...\n');

// 1. Ensure working directory is clean
try {
  const status = execSync('git status --porcelain').toString().trim();
  if (status) {
    console.error('\x1b[31m❌ Uncommitted changes detected.\x1b[0m');
    console.error('Commit or stash your changes before deploying to production.');
    process.exit(1);
  }
} catch (e) {
  process.exit(1);
}

try {
  // 2. Fetch latest remote changes
  run('git fetch origin');

  // 3. Update main
  run('git checkout main');
  run('git pull origin main --rebase');

  // 4. Update production
  run('git checkout production');
  run('git pull origin production --rebase');

  // 5. Sync production to match main cleanly
  run('git merge main --no-ff -m "chore(release): deploy main to production"');

  // 6. Push to remote production branch
  run('git push origin production');

  console.log('\n✅ Production branch updated successfully.');
  console.log('🚀 GitHub Actions will build and push the Docker image to GHCR.');
  console.log('📦 Railway will then deploy the live release.\n');
} catch (error) {
  console.error('\x1b[31m\n❌ Deployment script aborted due to error.\x1b[0m');
} finally {
  // 7. ALWAYS return to main working branch safely
  try {
    run('git checkout main');
  } catch (e) {}
}
