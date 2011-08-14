<?php
echo "Line 1\n";
echo "Line 2\n";
func1();
echo "Line 3\n";
function func1()
{
    echo "Function 1\n";
    func2();
}
function func2()
{
    echo "Function 2\n";
}