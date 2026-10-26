import Studio from "@/components/studio";

export default async function Project({ params }) {
    const { id } = await params;
    return <Studio view="project" projectId={id} />;
}