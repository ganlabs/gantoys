import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Auto-pull: executa git pull automaticamente ao iniciar o pi
 * neste repositório.
 */
export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    try {
      const { execSync } = await import("child_process");

      const result = execSync("git pull", {
        cwd: ctx.cwd,
        encoding: "utf8",
        timeout: 30000,
        shell: process.platform === "win32" ? "cmd.exe" : true,
      }).trim();

      if (result && !result.includes("Already up to date")) {
        const firstLine = result.split("\n")[0];
        ctx.ui.notify(`🔄 Auto-pull: ${firstLine}`, "info");
      }
    } catch {
      // Ignora silenciosamente se não for um repositório git
      // ou se houver erro de rede
    }
  });
}
