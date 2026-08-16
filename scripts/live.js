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

console.log('\n🚀 Mirroring main → production...\n');

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

  // 3. Ensure main branch is up to date
  run('git checkout main');
  run('git pull origin main --rebase');

  // 4. Checkout production (or create if missing)
  try {
    run('git checkout production');
  } catch (e) {
    console.log('ℹ️ Creating local production branch...');
    run('git checkout -b production');
  }

  // 5. Hard reset production to match main EXACTLY (0 extra merge commits!)
  run('git reset --hard main');

  // 6. Push production branch to remote cleanly
  run('git push origin production --force-with-lease');

  console.log('\n✅ Production branch mirrored to main successfully (0 divergence).');
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
