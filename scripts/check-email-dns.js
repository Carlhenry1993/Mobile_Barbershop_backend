const { Resolver } = require("dns").promises;

const domain = process.env.MAIL_DOMAIN || "mrrenaudinbarbershop.com";
const LOOKUP_TIMEOUT_MS = Number(process.env.DNS_LOOKUP_TIMEOUT_MS || 3000);
const DNS_SERVERS = (process.env.DNS_SERVERS || "1.1.1.1,8.8.8.8")
  .split(",")
  .map((server) => server.trim())
  .filter(Boolean);

const lookupRecords = (name, type) => {
  const resolver = new Resolver({ timeout: LOOKUP_TIMEOUT_MS, tries: 1 });
  resolver.setServers(DNS_SERVERS);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      resolver.cancel();
      reject(new Error("DNS lookup timed out"));
    }, LOOKUP_TIMEOUT_MS);

    resolver[type](name)
      .then((records) => {
        clearTimeout(timer);
        resolve(records);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
};

const printTxt = async (name) => {
  try {
    const records = await lookupRecords(name, "resolveTxt");
    console.log(`${name} TXT`);
    records.forEach((record) => console.log(`- ${record.join("")}`));
  } catch (error) {
    console.log(`${name} TXT missing or unavailable: ${error.code || error.message}`);
  }
};

const printCname = async (name) => {
  try {
    const records = await lookupRecords(name, "resolveCname");
    console.log(`${name} CNAME`);
    records.forEach((record) => console.log(`- ${record}`));
  } catch (error) {
    console.log(`${name} CNAME missing or unavailable: ${error.code || error.message}`);
  }
};

(async () => {
  await Promise.all([
    printTxt(domain),
    printTxt(`_dmarc.${domain}`),
    printCname(`s1._domainkey.${domain}`),
    printCname(`s2._domainkey.${domain}`),
  ]);
})().catch((error) => {
  console.error("Email DNS check failed:", error.message);
  process.exitCode = 1;
}).finally(() => {
  process.exit(process.exitCode || 0);
});
