import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Policy bands
  const bands = [
    { band: "B1", flightClass: "Economy",         trainClass: "AC 3-Tier", hotelStars: 3, perDiemInr: 1500 },
    { band: "B2", flightClass: "Economy",         trainClass: "AC 3-Tier", hotelStars: 3, perDiemInr: 1500 },
    { band: "B3", flightClass: "Economy",         trainClass: "AC 2-Tier", hotelStars: 4, perDiemInr: 2500 },
    { band: "B4", flightClass: "Economy",         trainClass: "AC 2-Tier", hotelStars: 4, perDiemInr: 2500 },
    { band: "B5", flightClass: "Premium Economy", trainClass: "AC 1-Tier", hotelStars: 5, perDiemInr: 4000 },
    { band: "B6", flightClass: "Business",        trainClass: "AC 1-Tier", hotelStars: 5, perDiemInr: 6000 },
  ];
  for (const b of bands) {
    await prisma.policyBand.upsert({ where: { band: b.band }, update: b, create: b });
  }
  console.log(`  ${bands.length} policy bands upserted`);

  // Employees
  const employees = [
    { id: "E1001", name: "Priya Sharma",  email: "priya.sharma@bank.example",
      band: "B3", homeCity: "Mumbai", homeLat: 19.0760, homeLng: 72.8777,
      department: "Corporate Banking", managerEmail: "rakesh.iyer@bank.example", costCenter: "CB-MUM-014" },
    { id: "E1002", name: "Arjun Mehta",   email: "arjun.mehta@bank.example",
      band: "B5", homeCity: "Mumbai", homeLat: 19.0760, homeLng: 72.8777,
      department: "Investment Banking", managerEmail: "ceo.office@bank.example", costCenter: "IB-MUM-002" },
    { id: "E1003", name: "Neha Verma",    email: "neha.verma@bank.example",
      band: "B1", homeCity: "Pune",   homeLat: 18.5204, homeLng: 73.8567,
      department: "Operations", managerEmail: "ops.head@bank.example", costCenter: "OPS-PUN-021" },
  ];
  for (const e of employees) {
    await prisma.employee.upsert({ where: { id: e.id }, update: e, create: e });
  }
  console.log(`  ${employees.length} employees upserted`);

  // Clients
  const clients = [
    { name: "Bajaj Finance",
      address: "4th Floor, Bajaj Finserv Corporate Office, Mundhwa, Pune",
      city: "Pune", lat: 18.5512, lng: 73.9326 },
    { name: "Persistent Systems",
      address: "Aryabhata-Pingala, Hinjewadi Phase I, Pune",
      city: "Pune", lat: 18.5912, lng: 73.7389 },
    { name: "Tata Capital",
      address: "Lodha Excelus, Apollo Mills, Mahalaxmi, Mumbai",
      city: "Mumbai", lat: 18.9942, lng: 72.8260 },
  ];
  for (const c of clients) {
    await prisma.client.upsert({
      where: { name: c.name },
      update: c,
      create: { ...c, source: "directory" },
    });
  }
  console.log(`  ${clients.length} clients upserted`);

  console.log("Seed complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
