export const maskEmail = (email) => {
  const [localPart, domain] = email.split("@");
  const maskedLocalPart = `${localPart[0]}******${localPart.slice(-1)}`;
  const maskedDomain = domain;

  return `${maskedLocalPart}@${maskedDomain}`;
};
