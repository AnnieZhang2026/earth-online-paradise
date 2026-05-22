/**
 * GitHub REST API utilities for ToWhere globe photo storage.
 */

const OWNER = import.meta.env.VITE_GITHUB_OWNER;
const REPO = import.meta.env.VITE_GITHUB_REPO;
const BRANCH = import.meta.env.VITE_GITHUB_BRANCH || 'main';
const TOKEN_KEY = 'towhere_github_token';

export function getToken() {
    try {
        return localStorage.getItem(TOKEN_KEY) || '';
    } catch {
        return '';
    }
}

export function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token.trim());
}

export function hasToken() {
    return !!getToken();
}

/**
 * Upload a file to GitHub repo via REST API.
 * @param {string} path - Repo-relative path
 * @param {string} base64Content - Base64 content without data URI prefix
 * @param {string} commitMessage
 * @returns {Promise<{success: boolean, url?: string, error?: string}>}
 */
export async function uploadFileToGitHub(path, base64Content, commitMessage = 'Add image via ToWhere') {
    const token = getToken();
    if (!token) return { success: false, error: 'GitHub Token 未配置，请先在设置中配置' };

    try {
        const encodedPath = path.split('/').map(encodeURIComponent).join('/');

        // Check if file exists
        let sha = null;
        const checkRes = await fetch(
            `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodedPath}?ref=${BRANCH}`,
            { headers: { Authorization: `token ${token}` } }
        );
        if (checkRes.ok) {
            const existing = await checkRes.json();
            sha = existing.sha;
        }

        const body = { message: commitMessage, content: base64Content, branch: BRANCH };
        if (sha) body.sha = sha;

        const res = await fetch(
            `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodedPath}`,
            {
                method: 'PUT',
                headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            }
        );

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            return { success: false, error: errData.message || `HTTP ${res.status}` };
        }

        const data = await res.json();
        return { success: true, url: getJsDelivrUrl(path), rawUrl: data.content?.download_url };

    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * Get jsDelivr CDN URL for instant access.
 */
export function getJsDelivrUrl(path) {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    return `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}/${encodedPath}`;
}

/**
 * List files in a directory on GitHub.
 */
export async function listFilesInDir(dirPath) {
    const token = getToken();
    if (!token) return { success: false, error: 'Token 未配置' };

    try {
        const res = await fetch(
            `https://api.github.com/repos/${OWNER}/${REPO}/contents/${dirPath}?ref=${BRANCH}`,
            { headers: { Authorization: `token ${token}` } }
        );
        if (!res.ok) {
            if (res.status === 404) return { success: true, files: [] };
            return { success: false, error: `HTTP ${res.status}` };
        }
        const data = await res.json();
        return { success: true, files: Array.isArray(data) ? data.filter(i => i.type === 'file') : [] };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * Delete a file from GitHub.
 */
export async function deleteFileFromGitHub(path, sha, message = 'Delete image') {
    const token = getToken();
    if (!token) return { success: false, error: 'Token 未配置' };

    try {
        const res = await fetch(
            `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`,
            {
                method: 'DELETE',
                headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, sha, branch: BRANCH }),
            }
        );
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            return { success: false, error: errData.message || `HTTP ${res.status}` };
        }
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * Validate token by fetching authenticated user.
 */
export async function validateToken() {
    const token = getToken();
    if (!token) return { valid: false, error: 'Token 未配置' };

    try {
        const res = await fetch('https://api.github.com/user', {
            headers: { Authorization: `token ${token}` },
        });
        if (res.ok) {
            const data = await res.json();
            return { valid: true, username: data.login };
        }
        return { valid: false, error: `Token 无效 (HTTP ${res.status})` };
    } catch (err) {
        return { valid: false, error: err.message };
    }
}
