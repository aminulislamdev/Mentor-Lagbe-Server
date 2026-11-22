// Seeds the demo data the assignment asks for: connected tutors, students and
// admin, 12 realistic tuition posts across subjects, and sample applications.
//
// Accounts are created through BetterAuth's sign-up endpoint (CLIENT_URL), not
// inserted directly — only BetterAuth can hash a password, so accounts made any
// other way could never log in. Because of that, the client app must be running
// for the account step; `--skip-users` seeds only the tuition data.
//
//   npm run seed                # accounts + tuition data
//   npm run seed -- --skip-users # tuition data only
//   npm run seed:reset          # remove everything this script created
//
// Everything is keyed by the demo email addresses below, so re-running is safe
// and never touches an account that is not part of the demo set.

import mongoose from "mongoose";
import "dotenv/config";

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";
const PASSWORD = "mentorlagbe123";
const args = process.argv.slice(2);
const SKIP_USERS = args.includes("--skip-users");
const RESET_ONLY = args.includes("--reset");

const DEMO_USERS = [
  {
    email: "admin@mentorlagbe.com",
    name: "Arif Chowdhury",
    role: "admin",
    plan: "free",
    phone: "01700000001",
    bio: "Platform moderator at MentorLagbe.",
  },
  {
    email: "tutor.tanvir@mentorlagbe.com",
    name: "Tanvir Ahmed",
    role: "tutor",
    plan: "pro",
    phone: "01700000002",
    bio: "BUET graduate. Seven years teaching HSC mathematics and admission preparation.",
  },
  {
    email: "tutor.samia@mentorlagbe.com",
    name: "Samia Rahman",
    role: "tutor",
    plan: "free",
    phone: "01700000003",
    bio: "Physics lecturer. Simulation-first classes for SSC and HSC students.",
  },
  {
    email: "tutor.nafis@mentorlagbe.com",
    name: "Nafis Kamal",
    role: "tutor",
    plan: "pro",
    phone: "01700000004",
    bio: "CELTA-certified IELTS instructor, Band 8.5.",
  },
  {
    email: "student.tasnim@mentorlagbe.com",
    name: "Tasnim Rahman",
    role: "student",
    plan: "free",
    phone: "01700000005",
    bio: "HSC 2026 science student aiming for BUET.",
  },
  {
    email: "student.rakib@mentorlagbe.com",
    name: "Rakib Hasan",
    role: "student",
    plan: "free",
    phone: "01700000006",
    bio: "Preparing for university admission tests.",
  },
];

const DEMO_EMAILS = DEMO_USERS.map((user) => user.email);

const TUTOR_TANVIR = "tutor.tanvir@mentorlagbe.com";
const TUTOR_SAMIA = "tutor.samia@mentorlagbe.com";
const TUTOR_NAFIS = "tutor.nafis@mentorlagbe.com";

const TUITIONS = [
  {
    title: "HSC Higher Mathematics — Calculus & Vectors",
    subject: "Mathematics",
    classLevel: "HSC",
    mode: "Offline",
    location: "Dhanmondi, Dhaka",
    monthlyFee: 4500,
    daysPerWeek: 3,
    tutorEmail: TUTOR_TANVIR,
    tutorName: "Tanvir Ahmed",
    description:
      "Semester-long batch covering limits, differential calculus, integration and vector algebra, with weekly timed diagnostics and handwritten feedback on every problem set.",
  },
  {
    title: "Admission Mathematics Crash Course (BUET/DU)",
    subject: "Mathematics",
    classLevel: "Admission",
    mode: "Online",
    location: "Online (Google Meet)",
    monthlyFee: 6000,
    daysPerWeek: 4,
    tutorEmail: TUTOR_TANVIR,
    tutorName: "Tanvir Ahmed",
    description:
      "Question-pattern driven crash course for engineering and university admission tests, built from the last ten years of past papers.",
  },
  {
    title: "SSC Physics — Mechanics and Waves",
    subject: "Physics",
    classLevel: "SSC",
    mode: "Offline",
    location: "Uttara Sector 7, Dhaka",
    monthlyFee: 3500,
    daysPerWeek: 2,
    tutorEmail: TUTOR_SAMIA,
    tutorName: "Samia Rahman",
    description:
      "Concept-first physics for SSC candidates, with weekly lab demonstrations and structured derivations for the board exam.",
  },
  {
    title: "HSC Physics — Electricity, Optics and Modern Physics",
    subject: "Physics",
    classLevel: "HSC",
    mode: "Online",
    location: "Online (Zoom)",
    monthlyFee: 4200,
    daysPerWeek: 3,
    tutorEmail: TUTOR_SAMIA,
    tutorName: "Samia Rahman",
    description:
      "Second-paper HSC physics with simulation-led explanations, numerical drills and monthly mock exams.",
  },
  {
    title: "IELTS Academic Intensive — Target Band 7.5+",
    subject: "IELTS",
    classLevel: "Undergraduate",
    mode: "Online",
    location: "Online (Zoom)",
    monthlyFee: 5200,
    daysPerWeek: 3,
    tutorEmail: TUTOR_NAFIS,
    tutorName: "Nafis Kamal",
    description:
      "All four modules with one-to-one speaking mocks, writing task feedback and full-length practice tests every fortnight.",
  },
  {
    title: "Spoken English for Professionals",
    subject: "English",
    classLevel: "Career",
    mode: "Online",
    location: "Online (Google Meet)",
    monthlyFee: 3000,
    daysPerWeek: 2,
    tutorEmail: TUTOR_NAFIS,
    tutorName: "Nafis Kamal",
    description:
      "Confidence-first speaking practice for interviews and workplace communication, with recorded feedback on every session.",
  },
  {
    title: "HSC Chemistry — Organic and Physical",
    subject: "Chemistry",
    classLevel: "HSC",
    mode: "Offline",
    location: "Mirpur, Dhaka",
    monthlyFee: 4000,
    daysPerWeek: 3,
    tutorEmail: TUTOR_SAMIA,
    tutorName: "Samia Rahman",
    description:
      "Reaction mechanisms, IUPAC naming and stoichiometry, taught with worked problems and a weekly chapter test.",
  },
  {
    title: "SSC Biology — Human Physiology and Genetics",
    subject: "Biology",
    classLevel: "SSC",
    mode: "Online",
    location: "Online (Zoom)",
    monthlyFee: 2800,
    daysPerWeek: 2,
    tutorEmail: TUTOR_SAMIA,
    tutorName: "Samia Rahman",
    description:
      "Diagram-driven biology covering circulation, genetics and reproduction, with past-paper question practice.",
  },
  {
    title: "Full-Stack Web Development Mentorship",
    subject: "Programming",
    classLevel: "Undergraduate",
    mode: "Online",
    location: "Online (Discord + code review)",
    monthlyFee: 7000,
    daysPerWeek: 2,
    tutorEmail: TUTOR_TANVIR,
    tutorName: "Tanvir Ahmed",
    description:
      "One-to-one mentorship through TypeScript, React, Node and MongoDB, ending with a portfolio project reviewed like a real pull request.",
  },
  {
    title: "HSC Accounting — Financial Statements",
    subject: "Accounting",
    classLevel: "HSC",
    mode: "Offline",
    location: "Mohammadpur, Dhaka",
    monthlyFee: 3200,
    daysPerWeek: 2,
    tutorEmail: TUTOR_TANVIR,
    tutorName: "Tanvir Ahmed",
    description:
      "Ledger to final accounts, step by step, with a strong focus on board-exam presentation marks.",
  },
  // One pending and one rejected entry, so the moderation queue is not empty.
  {
    title: "Class 9 General Science — Foundation Batch",
    subject: "Science",
    classLevel: "Class 9",
    mode: "Offline",
    location: "Bashundhara, Dhaka",
    monthlyFee: 2600,
    daysPerWeek: 2,
    tutorEmail: TUTOR_NAFIS,
    tutorName: "Nafis Kamal",
    description: "Foundation science for Class 9 students, bridging school syllabus and SSC preparation.",
    approvalStatus: "pending",
  },
  {
    title: "Imported Unverified Batch (demo of a rejected post)",
    subject: "Mathematics",
    classLevel: "HSC",
    mode: "Online",
    location: "Online",
    monthlyFee: 9000,
    daysPerWeek: 5,
    tutorEmail: TUTOR_NAFIS,
    tutorName: "Nafis Kamal",
    description: "This listing exists to demonstrate the rejected state in the tutor dashboard.",
    approvalStatus: "rejected",
  },
];

// Applied after the tuitions exist, matched by title.
const APPLICATIONS = [
  {
    tuitionTitle: "HSC Higher Mathematics — Calculus & Vectors",
    studentEmail: "student.tasnim@mentorlagbe.com",
    studentName: "Tasnim Rahman",
    phone: "01700000005",
    schedule: "Sat–Mon–Wed, 4:00 PM",
    note: "Aiming for GPA 5.0 and the BUET admission test.",
    status: "accepted",
  },
  {
    tuitionTitle: "HSC Physics — Electricity, Optics and Modern Physics",
    studentEmail: "student.tasnim@mentorlagbe.com",
    studentName: "Tasnim Rahman",
    phone: "01700000005",
    schedule: "Evening after 6 PM",
    note: "Second paper is my weakest subject.",
    status: "pending",
  },
  {
    tuitionTitle: "IELTS Academic Intensive — Target Band 7.5+",
    studentEmail: "student.rakib@mentorlagbe.com",
    studentName: "Rakib Hasan",
    phone: "01700000006",
    schedule: "Weekend mornings",
    note: "Planning to apply abroad next year.",
    status: "accepted",
  },
  {
    tuitionTitle: "Admission Mathematics Crash Course (BUET/DU)",
    studentEmail: "student.rakib@mentorlagbe.com",
    studentName: "Rakib Hasan",
    phone: "01700000006",
    schedule: "Any weekday evening",
    note: "Already following the past-paper solutions.",
    status: "pending",
  },
  {
    tuitionTitle: "Full-Stack Web Development Mentorship",
    studentEmail: "student.rakib@mentorlagbe.com",
    studentName: "Rakib Hasan",
    phone: "01700000006",
    schedule: "Friday and Saturday",
    note: "I have basic JavaScript knowledge.",
    status: "rejected",
  },
];

const banner = (id) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1200&q=80`;

const BANNERS = [
  "1635070041078-e363dbe005cb",
  "1517694712202-14dd9538aa97",
  "1636466497217-26a8cbeaf0aa",
  "1532094349884-543bc11b234d",
  "1456513080510-7bf3a84b82f8",
  "1523240795612-9a054b0db644",
];

async function removeDemoData(db) {
  const users = db.collection("users");
  const tuitions = db.collection("tuitions");
  const applications = db.collection("applications");

  await applications.deleteMany({
    $or: [{ studentEmail: { $in: DEMO_EMAILS } }, { tutorEmail: { $in: DEMO_EMAILS } }],
  });
  await tuitions.deleteMany({ tutorEmail: { $in: DEMO_EMAILS } });
  await db.collection("payments").deleteMany({ userEmail: { $in: DEMO_EMAILS } });

  // Remove the BetterAuth rows too, otherwise a re-seeded account inherits a
  // stale session and an orphaned credential record.
  const demoUsers = await users.find({ email: { $in: DEMO_EMAILS } }).toArray();
  const ids = demoUsers.map((user) => user._id);

  if (ids.length > 0) {
    await db.collection("sessions").deleteMany({ userId: { $in: ids } });
    await db.collection("accounts").deleteMany({ userId: { $in: ids } });
  }

  await users.deleteMany({ email: { $in: DEMO_EMAILS } });

  console.log("Removed the demo tuitions, applications and accounts.");
}

async function createAccounts() {
  const created = [];

  for (const person of DEMO_USERS) {
    try {
      const response = await fetch(`${CLIENT_URL}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: CLIENT_URL },
        body: JSON.stringify({
          name: person.name,
          email: person.email,
          password: PASSWORD,
          role: person.role,
          ...(person.bio ? { bio: person.bio } : {}),
          ...(person.phone ? { phone: person.phone } : {}),
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const alreadyExists = response.status === 422 || /exist/i.test(body?.message ?? "");
        if (alreadyExists) {
          created.push(`${person.email} (already existed)`);
          continue;
        }
        throw new Error(body?.message || `sign-up failed with ${response.status}`);
      }

      created.push(person.email);
    } catch (error) {
      throw new Error(
        `Could not create ${person.email}: ${error.message}\n` +
          `Is the client running at ${CLIENT_URL}? Otherwise re-run with --skip-users.`
      );
    }
  }

  return created;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB || "mentorlagbe",
  });

  const db = mongoose.connection.db;
  const collections = {
    users: db.collection("users"),
    tuitions: db.collection("tuitions"),
    applications: db.collection("applications"),
    payments: db.collection("payments"),
  };

  if (RESET_ONLY) {
    await removeDemoData(db);
    await mongoose.disconnect();
    return;
  }

  // Idempotent: clear only this script's own rows before inserting.
  await removeDemoData(db);

  if (SKIP_USERS) {
    console.log(`Skipping account creation (--skip-users). Tuitions will still reference:\n  ${DEMO_EMAILS.join("\n  ")}`);
  } else {
    const created = await createAccounts();
    console.log(`Accounts ready (${created.length}):\n  ${created.join("\n  ")}`);

    // BetterAuth only takes role and plan at sign-up for role; plan is set here.
    for (const person of DEMO_USERS) {
      await collections.users.updateOne(
        { email: person.email },
        { $set: { role: person.role, ...(person.plan !== "free" ? { plan: person.plan } : {}) } }
      );
    }
  }

  const now = Date.now();
  const tuitionDocs = TUITIONS.map((tuition, index) => ({
    ...tuition,
    approvalStatus: tuition.approvalStatus ?? "approved",
    isActive: true,
    bannerImage: banner(BANNERS[index % BANNERS.length]),
    createdAt: new Date(now - index * 6 * 60 * 60 * 1000), // a few hours apart
    updatedAt: new Date(now - index * 6 * 60 * 60 * 1000),
  }));

  const inserted = await collections.tuitions.insertMany(tuitionDocs);
  console.log(`Inserted ${inserted.insertedCount} tuitions.`);

  const byTitle = new Map(tuitionDocs.map((doc, index) => [doc.title, inserted.insertedIds[index]]));

  const applicationDocs = APPLICATIONS.map((application, index) => {
    const source = TUITIONS.find((t) => t.title === application.tuitionTitle);
    return {
      tuitionId: String(byTitle.get(application.tuitionTitle)),
      tuitionTitle: source.title,
      subject: source.subject,
      monthlyFee: source.monthlyFee,
      tutorEmail: source.tutorEmail,
      studentName: application.studentName,
      studentEmail: application.studentEmail,
      studentPhone: application.phone,
      preferredSchedule: application.schedule,
      studentNote: application.note,
      status: application.status,
      appliedAt: new Date(now - index * 9 * 60 * 60 * 1000),
      createdAt: new Date(now - index * 9 * 60 * 60 * 1000),
      updatedAt: new Date(now - index * 9 * 60 * 60 * 1000),
    };
  });

  await collections.applications.insertMany(applicationDocs);
  console.log(`Inserted ${applicationDocs.length} applications.`);

  const paymentDocs = [
    {
      userEmail: TUTOR_TANVIR,
      userName: "Tanvir Ahmed",
      userRole: "tutor",
      planName: "Tutor Pro",
      amount: 15,
      currency: "usd",
      transactionId: "pi_3Qk7sL2eZvKYlo2C0mNtP9wT",
      stripeSessionId: "cs_test_tanvir_pro_seed",
      paymentStatus: "paid",
      paidAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
      createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
    },
    {
      userEmail: TUTOR_NAFIS,
      userName: "Nafis Kamal",
      userRole: "tutor",
      planName: "Tutor Pro",
      amount: 15,
      currency: "usd",
      transactionId: "pi_3Qk8tM3fZwLZmp3D1nOuQ0xU",
      stripeSessionId: "cs_test_nafis_pro_seed",
      paymentStatus: "paid",
      paidAt: new Date(now - 5 * 24 * 60 * 60 * 1000),
      createdAt: new Date(now - 5 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(now - 5 * 24 * 60 * 60 * 1000),
    },
  ];

  await collections.payments.insertMany(paymentDocs);
  console.log(`Inserted ${paymentDocs.length} payment records.`);

  console.log(`\nDone. Accounts use the password: ${PASSWORD}`);
  for (const person of DEMO_USERS) {
    console.log(`  ${person.role.padEnd(8)} ${person.email}`);
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(`\n❌ ${error.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
