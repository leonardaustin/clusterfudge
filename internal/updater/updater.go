package updater

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// UpdateInfo describes an available update.
type UpdateInfo struct {
	Version      string `json:"version"`
	ReleaseURL   string `json:"releaseUrl"`
	AssetURL     string `json:"assetUrl"`
	Size         int64  `json:"size"`
	ReleaseNotes string `json:"releaseNotes"`
	PublishedAt  string `json:"publishedAt"`
	Checksum     string `json:"checksum"`
}

// Updater checks for and downloads updates from GitHub releases.
type Updater struct {
	owner   string
	repo    string
	current string
	client  *http.Client
}

// NewUpdater creates an Updater for the given GitHub owner/repo.
func NewUpdater(owner, repo, currentVersion string) *Updater {
	return &Updater{
		owner:   owner,
		repo:    repo,
		current: currentVersion,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

type ghRelease struct {
	TagName     string    `json:"tag_name"`
	HTMLURL     string    `json:"html_url"`
	Body        string    `json:"body"`
	Draft       bool      `json:"draft"`
	Prerelease  bool      `json:"prerelease"`
	PublishedAt string    `json:"published_at"`
	Assets      []ghAsset `json:"assets"`
}

type ghAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	Size               int64  `json:"size"`
}

// CheckForUpdate queries GitHub for the latest release.
func (u *Updater) CheckForUpdate(ctx context.Context) (*UpdateInfo, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/releases/latest", u.owner, u.repo)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := u.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("check update: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github API returned %d", resp.StatusCode)
	}

	var release ghRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, fmt.Errorf("decode release: %w", err)
	}

	if release.Draft || release.Prerelease {
		return nil, nil
	}

	latestVersion := strings.TrimPrefix(release.TagName, "v")
	currentVersion := strings.TrimPrefix(u.current, "v")
	if !isNewer(latestVersion, currentVersion) {
		return nil, nil
	}

	assetName := PlatformAssetName()
	var asset *ghAsset
	for i := range release.Assets {
		if release.Assets[i].Name == assetName {
			asset = &release.Assets[i]
			break
		}
	}
	if asset == nil {
		return nil, nil
	}

	checksum := u.findChecksum(ctx, release.Assets, assetName)

	return &UpdateInfo{
		Version:      release.TagName,
		ReleaseURL:   release.HTMLURL,
		AssetURL:     asset.BrowserDownloadURL,
		Size:         asset.Size,
		ReleaseNotes: release.Body,
		PublishedAt:  release.PublishedAt,
		Checksum:     checksum,
	}, nil
}

// DownloadUpdate downloads the update binary and verifies its SHA256 checksum.
func (u *Updater) DownloadUpdate(ctx context.Context, info *UpdateInfo, progress func(downloaded, total int64)) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, info.AssetURL, nil)
	if err != nil {
		return "", err
	}

	resp, err := u.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("download update: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download update: server returned HTTP %d", resp.StatusCode)
	}

	tmpFile, err := os.CreateTemp("", "clusterfudge-update-*")
	if err != nil {
		return "", fmt.Errorf("create temp file: %w", err)
	}

	hasher := sha256.New()
	writer := io.MultiWriter(tmpFile, hasher)

	var downloaded int64
	buf := make([]byte, 32*1024)
	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			if _, err := writer.Write(buf[:n]); err != nil {
				tmpFile.Close()
				_ = os.Remove(tmpFile.Name())
				return "", fmt.Errorf("write update: %w", err)
			}
			downloaded += int64(n)
			if progress != nil {
				progress(downloaded, info.Size)
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			tmpFile.Close()
			_ = os.Remove(tmpFile.Name())
			return "", fmt.Errorf("read update: %w", readErr)
		}
	}

	if err := tmpFile.Close(); err != nil {
		_ = os.Remove(tmpFile.Name())
		return "", fmt.Errorf("close temp file: %w", err)
	}

	if info.Checksum != "" {
		expected := strings.ToLower(strings.TrimSpace(info.Checksum))
		if len(expected) != 64 {
			_ = os.Remove(tmpFile.Name())
			return "", fmt.Errorf("invalid checksum format: expected 64 hex characters, got %d", len(expected))
		}
		got := hex.EncodeToString(hasher.Sum(nil))
		if got != expected {
			_ = os.Remove(tmpFile.Name())
			return "", fmt.Errorf("checksum mismatch: expected %s, got %s", expected, got)
		}
	}

	return tmpFile.Name(), nil
}

// findChecksum looks for a checksums file in the release assets and extracts
// the SHA256 hash for the given asset name. Returns empty string if not found.
func (u *Updater) findChecksum(ctx context.Context, assets []ghAsset, assetName string) string {
	checksumNames := []string{"checksums.txt", "SHA256SUMS", assetName + ".sha256"}
	var checksumURL string
	for _, name := range checksumNames {
		for i := range assets {
			if assets[i].Name == name {
				checksumURL = assets[i].BrowserDownloadURL
				break
			}
		}
		if checksumURL != "" {
			break
		}
	}
	if checksumURL == "" {
		return ""
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, checksumURL, nil)
	if err != nil {
		log.Printf("warning: updater: failed to create checksum request: %v", err)
		return ""
	}
	resp, err := u.client.Do(req)
	if err != nil {
		log.Printf("warning: updater: failed to fetch checksum file: %v", err)
		return ""
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		log.Printf("warning: updater: checksum file returned HTTP %d", resp.StatusCode)
		return ""
	}

	checksum, err := parseChecksumFile(resp.Body, assetName)
	if err != nil {
		log.Printf("warning: updater: failed to parse checksum file: %v", err)
		return ""
	}
	return checksum
}

// parseChecksumFile reads a checksums file and returns the hex digest for the
// given filename. It supports two formats:
//
//	<hash>  <filename>   (SHA256SUMS / checksums.txt)
//	<hash>               (single-hash .sha256 file)
func parseChecksumFile(r io.Reader, filename string) (string, error) {
	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		switch len(fields) {
		case 1:
			return fields[0], nil
		case 2:
			if fields[1] == filename || strings.TrimPrefix(fields[1], "*") == filename {
				return fields[0], nil
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return "", fmt.Errorf("reading checksum file: %w", err)
	}
	return "", nil
}

// PlatformAssetName returns the expected asset filename for the current platform.
func PlatformAssetName() string {
	return platformAssetName(runtime.GOOS, runtime.GOARCH)
}

// platformAssetName returns the expected asset filename for the given OS and architecture.
func platformAssetName(goos, goarch string) string {
	switch goos {
	case "darwin":
		return fmt.Sprintf("clusterfudge_darwin_%s.dmg", goarch)
	case "linux":
		return fmt.Sprintf("clusterfudge_linux_%s.tar.gz", goarch)
	default:
		return ""
	}
}

// isNewer returns true if latest is a higher semver than current.
func isNewer(latest, current string) bool {
	lParts := parseSemver(latest)
	cParts := parseSemver(current)

	for i := 0; i < 3; i++ {
		if lParts[i] > cParts[i] {
			return true
		}
		if lParts[i] < cParts[i] {
			return false
		}
	}
	return false
}

func parseSemver(v string) [3]int {
	parts := strings.SplitN(v, ".", 3)
	var result [3]int
	for i := 0; i < 3 && i < len(parts); i++ {
		// Strip any pre-release suffix
		clean := strings.SplitN(parts[i], "-", 2)[0]
		n, _ := strconv.Atoi(clean)
		result[i] = n
	}
	return result
}
