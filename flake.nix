{
  description = "Cloudflare Zero Trust Machines Dashboard development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    { nixpkgs, ... }:
    let
      supportedSystems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      forAllSystems =
        function:
        nixpkgs.lib.genAttrs supportedSystems (
          system:
          function {
            pkgs = import nixpkgs { inherit system; };
          }
        );
    in
    {
      devShells = forAllSystems (
        { pkgs }:
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.bun
              pkgs.git
              pkgs.opentofu
            ];

            shellHook = ''
              echo "Zero Trust Machines Dashboard"
              echo "Runtime: Bun"
              echo "IaC CLI: OpenTofu"
              echo "Install dependencies: bun install"
              echo "Start dev server: bun run dev"
            '';
          };
        }
      );
    };
}
