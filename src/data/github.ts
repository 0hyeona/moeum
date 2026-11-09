// Accept a repository URL, rather than a GitHub profile or a nested file URL.
export function githubRepository(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || !['github.com', 'www.github.com'].includes(url.hostname) || url.username || url.password || url.port) return null;
    const match = url.pathname.match(/^\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9_.-]+)\/?$/);
    if (!match) return null;
    const repository = match[2].replace(/\.git$/, '');
    return repository && repository !== '.' && repository !== '..' ? `${match[1]}/${repository}` : null;
  } catch {
    return null;
  }
}
