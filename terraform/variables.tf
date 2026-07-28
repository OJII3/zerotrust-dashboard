variable "cloudflare_account_id" {
  description = "Cloudflare account ID that owns the Zero Trust configuration."
  type        = string
}

variable "access_application_name" {
  description = "Display name for the Cloudflare Access application."
  type        = string
  default     = "Zero Trust Machines Dashboard"
}

variable "access_application_domain" {
  description = "Hostname protected by Cloudflare Access, for example machines.example.com."
  type        = string
}

variable "access_session_duration" {
  description = "Duration of the Access session token."
  type        = string
  default     = "24h"
}

variable "access_app_launcher_visible" {
  description = "Whether the application is visible in the Cloudflare Access app launcher."
  type        = bool
  default     = false
}

variable "access_allowed_idps" {
  description = "Optional list of identity provider IDs users may select for this app. Leave empty to allow all configured IdPs."
  type        = list(string)
  default     = []
}

variable "access_auto_redirect_to_identity" {
  description = "Automatically redirect to the single configured identity provider. Only effective when access_allowed_idps has one item."
  type        = bool
  default     = true
}

variable "access_policy_name" {
  description = "Display name for the inline Access policy."
  type        = string
  default     = "Allow dashboard viewers"
}

variable "access_policy_include" {
  description = <<-EOT
    Access include rules for the allow policy.

    Example:
    [
      { email = { email = "admin@example.com" } },
      { email_domain = { domain = "example.com" } }
    ]
  EOT
  type        = any
}

variable "access_policy_require" {
  description = "Optional Access require rules for the allow policy."
  type        = any
  default     = []
}

variable "access_policy_exclude" {
  description = "Optional Access exclude rules for the allow policy."
  type        = any
  default     = []
}

variable "worker_custom_domain" {
  description = <<-EOT
    Optional Worker custom domain configuration. When set, Terraform routes access_application_domain to the Worker service.

    Example:
    {
      zone_name = "example.com"
      service   = "zerotrust-dashboard"
    }
  EOT

  type = object({
    zone_id   = optional(string)
    zone_name = optional(string)
    service   = optional(string)
  })
  default = null

  validation {
    condition = (
      var.worker_custom_domain == null ||
      var.worker_custom_domain.zone_id != null ||
      var.worker_custom_domain.zone_name != null
    )
    error_message = "worker_custom_domain must include either zone_id or zone_name."
  }
}
