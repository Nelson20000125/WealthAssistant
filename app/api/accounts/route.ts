import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { validateAccountInput } from "@/lib/accountValidation";

export async function GET() {
  const session = await auth();
  const accounts = await prisma.account.findMany({
    where: { userId: session!.user.id },
    select: { id: true, name: true, type: true, institution: true, currency: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ accounts });
}

export async function POST(req: Request) {
  const session = await auth();
  const body = await req.json();
  const error = validateAccountInput(body);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const account = await prisma.account.create({
    data: {
      userId: session!.user.id,
      name: body.name.trim(),
      type: body.type,
      institution: body.institution.trim(),
      currency: body.currency.trim().toUpperCase(),
    },
  });

  return NextResponse.json({ account });
}
