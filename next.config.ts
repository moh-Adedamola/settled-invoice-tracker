import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * @react-pdf/renderer is loaded by Node at runtime, not bundled.
   *
   * Bundled, it fails with `RangeError: Offset is outside the bounds of the
   * DataView` the first time it parses a font — fontkit reads TTF tables
   * through a DataView over a Buffer, and the bundler's module interop does not
   * survive that. The same fonts open cleanly under plain `node --input-type=module`
   * and render a PDF, which is what localised the fault to bundling rather than
   * to the font files.
   *
   * It is also a genuinely external package: it reads .ttf files off disk with
   * `fs`, so there is nothing for a bundler to usefully do with it.
   */
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
