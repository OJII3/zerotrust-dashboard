resource "cloudflare_zero_trust_access_application" "dashboard" {
  account_id = var.cloudflare_account_id

  name             = var.access_application_name
  domain           = var.access_application_domain
  type             = "self_hosted"
  session_duration = var.access_session_duration

  app_launcher_visible = var.access_app_launcher_visible
  allowed_idps         = length(var.access_allowed_idps) > 0 ? var.access_allowed_idps : null

  auto_redirect_to_identity  = length(var.access_allowed_idps) == 1 ? var.access_auto_redirect_to_identity : false
  enable_binding_cookie      = true
  http_only_cookie_attribute = true

  # Must not be "strict". The identity provider returns the browser to this
  # domain from the team domain, which the browser counts as a cross-site
  # navigation, so a strict CF_Authorization cookie is withheld and Access
  # bounces the request back to login forever (ERR_TOO_MANY_REDIRECTS).
  same_site_cookie_attribute = "lax"

  policies = [{
    name       = var.access_policy_name
    decision   = "allow"
    precedence = 1
    include    = var.access_policy_include
    require    = var.access_policy_require
    exclude    = var.access_policy_exclude
  }]
}
