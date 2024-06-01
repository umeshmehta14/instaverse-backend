export const maskEmail = (email) => {
  const [localPart, domain] = email.split("@");
  const maskedLocalPart =
    localPart.length > 4
      ? `${localPart.slice(0, 2)}******${localPart.slice(-2)}`
      : `${localPart[0]}***${localPart.slice(-1)}`;

  const maskedDomain =
    domain.length > 4
      ? `${domain.slice(0, 2)}***${domain.slice(-2)}`
      : `${domain[0]}***${domain.slice(-1)}`;

  return `${maskedLocalPart}@${maskedDomain}`;
};
