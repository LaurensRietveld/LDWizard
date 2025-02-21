import { TransformationScript, TransformationConfiguration } from "../Definitions.ts";
import { DataFactory, Writer } from "n3";
import { cleanCsvValue, getBaseIdentifierIri, getBasePredicateIri, getFileBaseName } from "../utils/helpers.ts";

const { namedNode, literal } = DataFactory;

const rmlPrefixes: { [key: string]: string } = {
  rml: "http://semweb.mmlab.be/ns/rml#",
  rr: "http://www.w3.org/ns/r2rml#",
  ql: "http://semweb.mmlab.be/ns/ql#",
  csvw: "http://www.w3.org/ns/csvw#",
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  "": "http://example.org/rules/",
  schema: "http://schema.org/",
  dbo: "http://dbpedia.org/ontology/",
};
async function getRmlTransformationScript(configuration: TransformationConfiguration): Promise<TransformationScript> {
  const baseIri = configuration.baseIri.toString();

  // Create base RML interface
  const writer = new Writer({ prefixes: rmlPrefixes });
  const usesRefinedSource = configuration.columnConfiguration.some((config) => !!config.columnRefinement);
  writer.addQuad(namedNode(":TriplesMap"), namedNode("rdf:type"), namedNode("rr:TriplesMap"));
  writer.addQuad(
    namedNode(":TriplesMap"),
    namedNode("rml:logicalSource"),
    writer.blank([
      {
        predicate: namedNode("rml:source"),
        object: writer.blank([
          { predicate: namedNode("rdf:type"), object: namedNode("csvw:Table") },
          {
            predicate: namedNode("csvw:url"),
            object: literal(
              usesRefinedSource
                ? getFileBaseName(configuration.sourceFileName) + ".csv"
                : // ? getFileBaseName(configuration.sourceFileName) + "-emriched.csv"
                configuration.sourceFileName
            ),
          },
          {
            predicate: namedNode("csvw:dialect"),
            object: writer.blank([
              {
                predicate: namedNode("rdf:type"),
                object: namedNode("csvw:Dialect"),
              },
              {
                predicate: namedNode("csvw:delimiter"),
                object: literal(configuration.csvProps.delimiter),
              },
              {
                predicate: namedNode("csvw:encoding"),
                object: literal("UTF-8"),
              },
            ]),
          },
        ]),
      },
      {
        predicate: namedNode("rml:referenceFormulation"),
        object: namedNode("ql:CSV"),
      },
    ])
  );

  const keyColumnName =
    (configuration.key !== undefined &&
      configuration.key >= 0 &&
      configuration.columnConfiguration[configuration.key].columnName) ||
    undefined;
  const subjectTuple = !!keyColumnName
    ? {
      predicate: namedNode("rr:template"),
      object: literal(`${getBaseIdentifierIri(configuration.baseIri.toString())}{${keyColumnName}}`),
    }
    : // RML doesn't support adding base-iri + row-numbers as an identifier, so we use b-nodes here
    { predicate: namedNode("rr:termType"), object: namedNode("rr:BlankNode") };
  writer.addQuad(namedNode(":TriplesMap"), namedNode("rr:subjectMap"), writer.blank([subjectTuple]));
  // Assign "rdfs:Resource" as a class to each row
  writer.addQuad(
    namedNode(":TriplesMap"),
    namedNode("rr:predicateObjectMap"),
    writer.blank([
      {
        predicate: namedNode("rr:predicate"),
        object: namedNode("rdf:type"),
      },
      {
        predicate: namedNode("rr:objectMap"),
        object: writer.blank({
          predicate: namedNode("rr:constant"),
          object: namedNode(configuration.resourceClass),
        }),
      },
    ])
  );
  // Add columns to the transform script
  for (const header of configuration.columnConfiguration) {
    if (header.columnName === keyColumnName) continue;
    if (header.columnRefinement) {
      // don't add both if column refinement is "to-iri"
      if (header.columnRefinement?.type === "to-iri") {
        // add each seperately
        writer.addQuad(
          namedNode(":TriplesMap"),
          namedNode("rr:predicateObjectMap"),
          writer.blank([
            {
              predicate: namedNode("rr:predicate"),
              object: namedNode(
                header.propertyIri
                  ? header.propertyIri
                  : `${getBasePredicateIri(baseIri)}${cleanCsvValue(header.columnName)}`
              ),
            },
            {
              predicate: namedNode("rr:objectMap"),
              object: writer.blank(
                header.columnRefinement.data.iriPrefix === ""
                  ? [
                    {
                      predicate: namedNode("rml:reference"),
                      object: literal(`${header.columnName}`),
                    },
                    {
                      predicate: namedNode("rr:termType"),
                      object: namedNode("rr:IRI"),
                    },
                  ]
                  : [
                    {
                      predicate: namedNode("rr:termType"),
                      object: namedNode("rr:IRI"),
                    },
                    {
                      predicate: namedNode("rr:template"),
                      object: literal(`${header.columnRefinement.data.iriPrefix}{${header.columnName}}`),
                    },
                  ]
              ),
            },
          ])
        );
      } else {
        // for any other column refinement add both original and refined value to the RML script
        for (let i = 0; i < 2; i++) {
          let colName: string;
          if (i > 0) {
            colName = header.columnName;
            // add each seperately
            writer.addQuad(
              namedNode(":TriplesMap"),
              namedNode("rr:predicateObjectMap"),
              writer.blank([
                {
                  predicate: namedNode("rr:predicate"),
                  object: namedNode(
                    header.propertyIri ? header.propertyIri : `${getBasePredicateIri(baseIri)}${cleanCsvValue(colName)}`
                  ),
                },
                {
                  predicate: namedNode("rr:objectMap"),
                  object: writer.blank([
                    {
                      predicate: namedNode("rml:reference"),
                      object: literal(`${colName}`),
                    }
                  ]),
                },
              ])
            );
          } else {
            colName = `${header.columnName}-refined`;
            // add each seperately
            writer.addQuad(
              namedNode(":TriplesMap"),
              namedNode("rr:predicateObjectMap"),
              writer.blank([
                {
                  predicate: namedNode("rr:predicate"),
                  object: namedNode(
                    header.propertyIri ? header.propertyIri : `${getBasePredicateIri(baseIri)}${cleanCsvValue(colName)}`
                  ),
                },
                {
                  predicate: namedNode("rr:objectMap"),
                  object: writer.blank( [{
                      predicate: namedNode("rml:reference"),
                      object: literal(`${colName}`),
                    }]   
                  ),
                },
              ])
            );
          }

        }
      }
    } else {
      // non refined data
      writer.addQuad(
        namedNode(":TriplesMap"),
        namedNode("rr:predicateObjectMap"),
        writer.blank([
          {
            predicate: namedNode("rr:predicate"),
            object: namedNode(
              header.propertyIri
                ? header.propertyIri
                : `${getBasePredicateIri(baseIri)}${cleanCsvValue(header.columnName)}`
            ),
          },
          {
            predicate: namedNode("rr:objectMap"),
            object: writer.blank([
              {
                predicate: namedNode("rml:reference"),
                object: literal(header.columnName),
              },
            ]),
          },
        ])
      );
    }
  }
  return new Promise((resolve, reject) => {
    writer.end((error, result) => {
      if (error) reject(error);
      resolve(result);
    });
  });
}

export default getRmlTransformationScript;
