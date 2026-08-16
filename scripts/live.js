import { execSync } from 'child_process';

function run(command) {
  console.log(`\x1b[36m> ${command}\x1b[0m`);
  try {
    execSync(command, { stdio: 'inherit' });
  } catch (error) {
    console.error(`\x1b[31m❌ Command failed: ${command}\x1b[0m`);
    process.exit(1);
  }
}

console.log('🚀 Syncing main branch to production deployment...');

// 1. Check working directory status
try {
  const status = execSync('git status --porcelain').toString().trim();
  if (status) {
    console.error('\x1b[31m❌ Uncommitted changes detected. Please commit or stash changes before deploying to production.\x1b[0m');
    process.exit(1);
  }
} catch (e) {}

// 2. Fetch latest changes
run('git fetch origin');

// 3. Update main branch
run('git checkout main');
run('git pull origin main --rebase');

// 4. Switch to production branch
try {
  run('git checkout production');
  run('git pull origin production --rebase');
} catch (e) {
  console.log('ℹ️ Creating local production branch...');
  run('git checkout -b production');
}

// 5. Merge main into production cleanly
run('git merge main --no-ff -m "chore(release): deploy main to production"');

// 6. Push to remote production branch
run('git push origin production');

// 7. Return to main working branch
run('git checkout main');

console.log('✅ Success! Main branch synced to production. GitHub Actions and live hosting pipeline triggered.');
