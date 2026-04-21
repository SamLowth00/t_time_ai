import { NavLink } from "react-router-dom";

const vendors = [
  { slug: "clubv1", label: "ClubV1" },
  { slug: "chronogolf", label: "Chronogolf" },
  { slug: "brsgolf", label: "BRS Golf" },
];

export default function VendorTabs() {
  return (
    <nav className="flex gap-1 border-b border-gray-200">
      {vendors.map((v) => (
        <NavLink
          key={v.slug}
          to={`/${v.slug}`}
          className={({ isActive }) =>
            [
              "px-4 py-2 text-sm font-medium rounded-t-md -mb-px border",
              isActive
                ? "border-gray-200 border-b-white bg-white text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700",
            ].join(" ")
          }
        >
          {v.label}
        </NavLink>
      ))}
    </nav>
  );
}
