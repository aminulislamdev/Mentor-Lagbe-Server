// A local stand-in for api.imgbb.com, so the upload route can be verified
// without sending a test image to the project's real ImgBB account.
//
//   1) node tests/imgbb-stub.mjs                      (listens on :3100)
//   2) IMGBB_API_URL=http://127.0.0.1:3100/upload npm run dev
//   3) IMGBB_API_URL=http://127.0.0.1:3100/upload npm run verify

import http from "node:http";

const PORT = Number(process.env.IMGBB_STUB_PORT || 3100);

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      // ImgBB takes the API key as ?key=… on the URL; the image travels in the body.
      const key = new URL(req.url, "http://localhost").searchParams.get("key");
      const params = new URLSearchParams(body);

      if (!key) {
        return json(res, 400, { success: false, error: { message: "Missing key" } });
      }

      if (!params.get("image")) {
        return json(res, 400, { success: false, error: { message: "Empty image" } });
      }

      // Shaped like ImgBB's real success payload.
      json(res, 200, {
        success: true,
        status: 200,
        data: {
          url: "https://i.ibb.co/stub/pixel.png",
          display_url: "https://i.ibb.co/stub/pixel.png",
          thumb: { url: "https://i.ibb.co/stub/pixel_th.png" },
          delete_url: "https://ibb.co/stub/delete",
        },
      });
    });
  })
  .listen(PORT, () => console.log(`ImgBB stub listening on http://127.0.0.1:${PORT}/upload`));
