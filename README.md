<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/6cb12cbc-48ae-498a-b04b-f646f98508ac

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set `GEMINI_API_KEY` in [.env.local](.env.local) for CV structuring and visual analysis.
3. Set `MISTRAL_API_KEY` in the same file to enable OCR for scanned PDFs and images. Keep both keys in the deployment provider's secret settings in production; never add a real key to source control.
4. Run the app:
   `npm run dev`
