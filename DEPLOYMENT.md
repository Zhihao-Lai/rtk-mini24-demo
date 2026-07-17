# GitHub Pages deployment

This bundle is a standalone static site. The repository name used below is `rtk-mini24-demo`, producing:

`https://zhihao-lai.github.io/rtk-mini24-demo/`

## One-time authentication

```bash
gh auth login -h github.com -w
gh auth status
```

## Create and publish

Run these commands from this directory after authentication:

```bash
gh repo create Zhihao-Lai/rtk-mini24-demo --public --source . --remote origin
gh api --method POST repos/Zhihao-Lai/rtk-mini24-demo/pages -f build_type=workflow
git push -u origin main
gh run watch --repo Zhihao-Lai/rtk-mini24-demo
gh api repos/Zhihao-Lai/rtk-mini24-demo/pages --jq .html_url
```

The included `.github/workflows/pages.yml` publishes the repository root with GitHub Actions.
