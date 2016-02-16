namespace Kendo.Mvc.UI
{
    /// <summary>
    /// The filtering method used to determine the suggestions for the current value. Filtration is turned off by default.
    /// </summary>
    public enum FilterType
    {
        /// <summary>
        /// Matches items starting with the typed string
        /// </summary>
        StartsWith,
        /// <summary>
        /// Matches items ending with the typed string
        /// </summary>
        EndsWith,
        /// <summary>
        /// Matches items containing the typed string
        /// </summary>
        Contains
    }

    internal static class FilterTypeExtensions
    {
        internal static string Serialize(this FilterType value)
        {
            switch (value)
            {
                case FilterType.StartsWith:
                    return "startswith";
                case FilterType.EndsWith:
                    return "endswith";
                case FilterType.Contains:
                    return "contains";
            }

            return value.ToString();
        }
    }
}

