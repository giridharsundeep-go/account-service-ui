# Amazon RDS MySQL for EKS

The Java backends that own MySQL data have an `eks` Spring profile. Activate it with `SPRING_PROFILES_ACTIVE=eks`. The profile reads the RDS hostname from `RDS_HOST`, requires TLS, and keeps the database username and password in runtime environment variables.

## Database schemas

The URL supplied for the instance ends in `/mysql`. `mysql` is MySQL's system schema; application tables should use separate service schemas. Create these schemas before deploying the Pods with [the bootstrap SQL](../src/assets/deployment/rds-mysql-databases.sql).

| Service | Schema | URL override variable |
|---|---|---|
| Chatly | `chatly` | `DB_URL` |
| Professy core | `professy` | `DB_URL` |
| Professy email | `professy_email` | `DB_URL` |
| Professy notifications | `professy_notification` | `DB_URL` |
| Passport / identity | `greatley_identity` | `DB_URL` |
| Agenda / calendar | `greatley_calendar` | `DB_URL` |
| Radar / Instru | `greatley_instru` | `DB_URL` |
| Post / mail | `greatley_mail` | `DB_URL` |

Services that use the Professy API or Kafka/Redis without their own MySQL datasource do not need this profile.

## Credentials in EKS

Set `SPRING_PROFILES_ACTIVE=eks` on each database-backed Deployment. Populate `DB_PASSWORD` from an AWS Secrets Manager secret using the cluster's secret integration, then expose it to the container through a Kubernetes Secret reference. `DB_USERNAME` defaults to `admin`; set it from a secret/config value when you switch to a per-service account. Do not commit a credential manifest or put a password in `DB_URL`.

The EKS profile defaults `DB_USERNAME` to `admin` as requested, and you can override it per service. AWS recommends keeping the RDS master user out of applications; create least-privilege users with access only to their service schema and use `admin` for database administration.

Example Deployment environment entries:

```yaml
env:
  - name: SPRING_PROFILES_ACTIVE
    value: eks
  - name: RDS_HOST
    valueFrom:
      configMapKeyRef:
        name: rds-connection
        key: host
  - name: DB_USERNAME
    valueFrom:
      secretKeyRef:
        name: rds-credentials
        key: username
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: rds-credentials
        key: password
```

Set the `rds-connection` ConfigMap's `host` value to the RDS endpoint supplied for this environment. The port defaults to 3306. Set `SPRING_DATASOURCE_URL` if a service needs a different schema or connection options.

In the RDS security group, allow TCP 3306 from the EKS workload security group only. Keep the database private; same-VPC placement does not require public access.

## TLS behavior

The EKS profile uses Connector/J `sslMode=REQUIRED`: the connection must be encrypted, and it fails rather than falling back to plaintext. This mode does not validate the RDS server certificate or hostname, so it does not need a PEM bundle. Same-VPC networking provides reachability and isolation; it does not replace certificate validation.

If the deployment changes to `VERIFY_CA` or `VERIFY_IDENTITY`, install the current AWS RDS CA in a Java trust store and configure Connector/J to use it. Connector/J's `trustCertificateKeyStoreUrl` expects a supported Java keystore type such as JKS or PKCS12; a PEM bundle is not automatically a JKS/PKCS12 keystore.
