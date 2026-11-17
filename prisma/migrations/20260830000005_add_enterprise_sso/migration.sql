-- Enterprise SSO (OIDC only this pass — see roadmap notes for why SAML is
-- deferred). One IdP config per org, resolved at login by email domain; a
-- short-lived single-use ticket bridges a real completed OIDC callback into
-- NextAuth's own session-issuing machinery.

-- CreateTable
CREATE TABLE "organisation_sso_configs" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "emailDomain" TEXT NOT NULL,
    "issuerUrl" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "encryptedClientSecret" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organisation_sso_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sso_login_tickets" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "sso_login_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organisation_sso_configs_organisationId_key" ON "organisation_sso_configs"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "organisation_sso_configs_emailDomain_key" ON "organisation_sso_configs"("emailDomain");

-- CreateIndex
CREATE UNIQUE INDEX "sso_login_tickets_token_key" ON "sso_login_tickets"("token");

-- AddForeignKey
ALTER TABLE "organisation_sso_configs" ADD CONSTRAINT "organisation_sso_configs_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sso_login_tickets" ADD CONSTRAINT "sso_login_tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
