output "access_application_id" {
  description = "Cloudflare Access application ID."
  value       = cloudflare_zero_trust_access_application.dashboard.id
}

output "access_application_aud" {
  description = "Cloudflare Access audience tag. Set Worker runtime variable CF_ACCESS_AUD to this value."
  value       = cloudflare_zero_trust_access_application.dashboard.aud
}

output "access_application_domain" {
  description = "Hostname protected by Cloudflare Access."
  value       = cloudflare_zero_trust_access_application.dashboard.domain
}

output "worker_custom_domain_id" {
  description = "Worker custom domain ID when managed by Terraform."
  value       = try(cloudflare_workers_custom_domain.dashboard[0].id, null)
}
